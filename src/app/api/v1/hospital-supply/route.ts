import { NextResponse } from "next/server";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { PUBLIC_CDN_CACHE } from "@/lib/httpCache";
import { authenticatePartner, requestMeta } from "@/lib/partnerAuth";
import {
  requireJsonContentType,
  resolveRequestId,
  errorBody,
  safeDbError,
  SERVICE_UNAVAILABLE_MESSAGE,
} from "@/lib/apiPolicy.mjs";
import type { SupplyCategory, SupplyStatus, ConfidenceLevel } from "@/lib/types";

// GET /api/v1/hospital-supply
// Public read of current hospital supply status (all confidence levels).
// Consumers (map, adapters) use `confidence_level` to distinguish confirmed
// statuses from pending/extracted signals.
//
// POST /api/v1/hospital-supply
// Authenticated write (API key with `write` scope).
// - confidence_level "CONFIRMED": also requires an active POC assignment for
//   the hospital; rejects with 403 if the partner has none.
// - confidence_level "PENDING_REVIEW" | "EXTRACTED": write scope only — used
//   by social/anonymous signal adapters.

export const runtime = "nodejs";
export const maxDuration = 30;

const VALID_CATEGORIES = new Set<SupplyCategory>(["SUPPLIES", "BEDS", "STAFF", "EQUIPMENT"]);
const VALID_STATUSES = new Set<SupplyStatus>(["green", "yellow", "red", "unknown"]);
const VALID_CONFIDENCE = new Set<ConfidenceLevel>(["CONFIRMED", "PENDING_REVIEW", "EXTRACTED"]);
const VALID_PRIORITIES = new Set(["critical", "high", "medium", "low"]);
const VALID_ITEM_STATES = new Set(["needed", "sufficient", "unavailable"]);
const MAX_ITEMS = 50;

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const rl = rateLimit(await clientKey("hospital-supply"), { limit: 120, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: SERVICE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  const url = new URL(req.url);
  const hospital_id = url.searchParams.get("hospital_id") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const since = url.searchParams.get("since") ?? undefined;

  if (category && !VALID_CATEGORIES.has(category as SupplyCategory)) {
    return NextResponse.json(
      { error: `Parámetro 'category' inválido. Valores: ${[...VALID_CATEGORIES].join(", ")}.` },
      { status: 400 },
    );
  }
  if (status && !VALID_STATUSES.has(status as SupplyStatus)) {
    return NextResponse.json(
      { error: `Parámetro 'status' inválido. Valores: ${[...VALID_STATUSES].join(", ")}.` },
      { status: 400 },
    );
  }

  const svc = getServerSupabase();
  let query = svc
    .from("public_hospital_supply_status")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (hospital_id) query = query.eq("hospital_id", hospital_id);
  if (category) query = query.eq("category", category);
  if (status) query = query.eq("overall_status", status);
  if (since) query = query.lt("updated_at", since);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: SERVICE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  return NextResponse.json(
    { supply_status: data ?? [] },
    { headers: { "Cache-Control": PUBLIC_CDN_CACHE } },
  );
}

// ── POST ──────────────────────────────────────────────────────────────────────

interface SupplyItemInput {
  name: string;
  item_type?: string;
  quantity_required?: number;
  unit?: string;
  priority?: string;
  operational_notes?: string;
  state?: string;
}

interface SupplyWriteBody {
  hospital_id: string;
  category: string;
  overall_status: string;
  confidence_level?: string;
  source_record_id?: string;
  notes_internal?: string;
  expires_at?: string;
  items?: SupplyItemInput[];
}

export async function POST(req: Request) {
  const requestId = resolveRequestId(req.headers.get("x-request-id"));
  const rid = { "x-request-id": requestId };

  if (!isSupabaseConfigured()) {
    return NextResponse.json(errorBody(SERVICE_UNAVAILABLE_MESSAGE, requestId), { status: 503, headers: rid });
  }

  // Auth
  let partner: { partnerId: string; source: string; scopes: string[] } | null;
  try {
    partner = await authenticatePartner(req.headers.get("x-api-key"));
  } catch {
    return NextResponse.json(errorBody(SERVICE_UNAVAILABLE_MESSAGE, requestId), { status: 503, headers: rid });
  }
  if (!partner) {
    return NextResponse.json(errorBody("API key inválida o ausente.", requestId), { status: 401, headers: rid });
  }
  if (!partner.scopes?.includes("write")) {
    return NextResponse.json(errorBody("La key no tiene permiso de escritura.", requestId), { status: 403, headers: rid });
  }

  const rl = rateLimit(`hospital-supply:write:${partner.source}`, { limit: 60, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      errorBody("Demasiadas solicitudes.", requestId),
      { status: 429, headers: { ...rid, "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  if (!requireJsonContentType(req.headers.get("content-type"))) {
    return NextResponse.json(errorBody("Content-Type debe ser application/json.", requestId), { status: 415, headers: rid });
  }

  let body: SupplyWriteBody;
  try {
    body = (await req.json()) as SupplyWriteBody;
  } catch {
    return NextResponse.json(errorBody("Cuerpo JSON inválido.", requestId), { status: 400, headers: rid });
  }

  // Validate required fields
  const { hospital_id, category, overall_status } = body;
  if (!hospital_id || typeof hospital_id !== "string") {
    return NextResponse.json(errorBody("Campo 'hospital_id' requerido.", requestId), { status: 400, headers: rid });
  }
  if (!VALID_CATEGORIES.has(category as SupplyCategory)) {
    return NextResponse.json(
      errorBody(`'category' inválido. Valores: ${[...VALID_CATEGORIES].join(", ")}.`, requestId),
      { status: 400, headers: rid },
    );
  }
  if (!VALID_STATUSES.has(overall_status as SupplyStatus)) {
    return NextResponse.json(
      errorBody(`'overall_status' inválido. Valores: ${[...VALID_STATUSES].join(", ")}.`, requestId),
      { status: 400, headers: rid },
    );
  }

  const confidence_level = (body.confidence_level ?? "PENDING_REVIEW") as ConfidenceLevel;
  if (!VALID_CONFIDENCE.has(confidence_level)) {
    return NextResponse.json(
      errorBody(`'confidence_level' inválido. Valores: ${[...VALID_CONFIDENCE].join(", ")}.`, requestId),
      { status: 400, headers: rid },
    );
  }

  // Validate items array if provided
  const items = body.items ?? [];
  if (!Array.isArray(items) || items.length > MAX_ITEMS) {
    return NextResponse.json(
      errorBody(`'items' debe ser un arreglo de máximo ${MAX_ITEMS} elementos.`, requestId),
      { status: 400, headers: rid },
    );
  }
  for (const item of items) {
    if (!item.name || typeof item.name !== "string" || item.name.trim().length < 1) {
      return NextResponse.json(errorBody("Cada item debe tener un 'name'.", requestId), { status: 400, headers: rid });
    }
    if (item.priority && !VALID_PRIORITIES.has(item.priority)) {
      return NextResponse.json(
        errorBody(`'priority' inválido en item. Valores: ${[...VALID_PRIORITIES].join(", ")}.`, requestId),
        { status: 400, headers: rid },
      );
    }
    if (item.state && !VALID_ITEM_STATES.has(item.state)) {
      return NextResponse.json(
        errorBody(`'state' inválido en item. Valores: ${[...VALID_ITEM_STATES].join(", ")}.`, requestId),
        { status: 400, headers: rid },
      );
    }
  }

  const svc = getServerSupabase();

  // For CONFIRMED writes: verify the partner has an active POC for this hospital
  let poc_id: string | null = null;
  if (confidence_level === "CONFIRMED") {
    const { data: poc, error: pocErr } = await svc
      .from("hospital_pocs")
      .select("id")
      .eq("partner_id", partner.partnerId)
      .eq("active", true)
      .is("revoked_at", null)
      .gte("expires_at", new Date().toISOString())
      .or("expires_at.is.null")
      .limit(1)
      .maybeSingle();

    if (pocErr) {
      return NextResponse.json(errorBody(SERVICE_UNAVAILABLE_MESSAGE, requestId), { status: 503, headers: rid });
    }

    // Also verify the hospital assignment
    if (poc) {
      const { data: assignment } = await svc
        .from("hospital_poc_assignments")
        .select("poc_id")
        .eq("poc_id", poc.id)
        .eq("hospital_id", hospital_id)
        .maybeSingle();
      if (assignment) poc_id = poc.id;
    }

    if (!poc_id) {
      return NextResponse.json(
        errorBody("El partner no tiene un POC activo asignado a este hospital para confirmar estados.", requestId),
        { status: 403, headers: rid },
      );
    }
  }

  // Upsert the supply status
  const now = new Date().toISOString();
  const statusRow = {
    hospital_id,
    category,
    overall_status,
    confidence_level,
    source: partner.source,
    source_record_id: body.source_record_id ?? null,
    notes_internal: body.notes_internal ?? null,
    expires_at: body.expires_at ?? null,
    poc_id,
    updated_at: now,
    ...(confidence_level === "CONFIRMED" ? { verified_at: now } : {}),
  };

  const { data: upserted, error: upsertErr } = await svc
    .from("hospital_supply_status")
    .upsert(statusRow, { onConflict: "hospital_id,category", ignoreDuplicates: false })
    .select("id")
    .single();

  if (upsertErr || !upserted) {
    return NextResponse.json(errorBody(safeDbError(upsertErr), requestId), { status: 503, headers: rid });
  }

  const statusId = upserted.id as string;

  // Replace supply items if provided
  if (items.length > 0) {
    await svc.from("supply_items").delete().eq("supply_status_id", statusId);
    await svc.from("supply_items").insert(
      items.map((item) => ({
        supply_status_id: statusId,
        name: item.name.trim(),
        item_type: item.item_type ?? null,
        quantity_required: item.quantity_required ?? null,
        unit: item.unit ?? null,
        priority: item.priority ?? null,
        operational_notes: item.operational_notes ?? null,
        state: item.state ?? null,
      })),
    );
  }

  // Append audit log (non-blocking — failure is logged but doesn't fail the request)
  const meta = requestMeta(req, requestId);
  await svc.from("audit_log").insert({
    partner_id: partner.partnerId,
    source: partner.source,
    action: "CREATE",
    resource_table: "hospital_supply_status",
    resource_id: statusId,
    external_id: body.source_record_id ?? null,
    before: null,
    after: statusRow,
    request_id: meta.requestId,
    ip: meta.ip,
    user_agent: meta.userAgent,
  });

  return NextResponse.json(
    { supply_status_id: statusId, request_id: requestId },
    { status: 200, headers: rid },
  );
}
