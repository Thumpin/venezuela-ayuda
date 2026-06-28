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

// GET /api/v1/hospital-supply/signals
// Returns publicly visible unconfirmed signals (visibility='public', not yet
// dismissed or promoted). The map uses these to display unconfirmed pins with
// a distinct visual treatment from confirmed supply status.
//
// POST /api/v1/hospital-supply/signals
// Intake endpoint for social/anonymous observations. Requires write scope.
// Signals go into the review queue as PENDING_REVIEW — they never directly
// modify confirmed hospital supply status (that requires a human reviewer).

export const runtime = "nodejs";
export const maxDuration = 30;

const VALID_CATEGORIES = new Set(["SUPPLIES", "BEDS", "STAFF", "EQUIPMENT"]);
const VALID_STATUSES = new Set(["green", "yellow", "red", "unknown"]);
const VALID_SOURCE_TYPES = new Set(["confirmed_poc", "verified_partner", "public", "anonymous", "social"]);
const VALID_PLATFORMS = new Set(["x", "threads", "whatsapp", "screenshot", "anonymous", "phone", "other"]);

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const rl = rateLimit(await clientKey("supply-signals"), { limit: 120, windowSec: 60 });
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
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);

  const svc = getServerSupabase();
  let query = svc
    .from("public_supply_signals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (hospital_id) query = query.eq("hospital_id", hospital_id);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: SERVICE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }

  return NextResponse.json(
    { signals: data ?? [] },
    { headers: { "Cache-Control": PUBLIC_CDN_CACHE } },
  );
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const requestId = resolveRequestId(req.headers.get("x-request-id"));
  const rid = { "x-request-id": requestId };

  if (!isSupabaseConfigured()) {
    return NextResponse.json(errorBody(SERVICE_UNAVAILABLE_MESSAGE, requestId), { status: 503, headers: rid });
  }

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

  const rl = rateLimit(`supply-signals:write:${partner.source}`, { limit: 120, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      errorBody("Demasiadas solicitudes.", requestId),
      { status: 429, headers: { ...rid, "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  if (!requireJsonContentType(req.headers.get("content-type"))) {
    return NextResponse.json(errorBody("Content-Type debe ser application/json.", requestId), { status: 415, headers: rid });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(errorBody("Cuerpo JSON inválido.", requestId), { status: 400, headers: rid });
  }

  // Validate
  const source_type = (body.source_type as string) ?? "anonymous";
  if (!VALID_SOURCE_TYPES.has(source_type)) {
    return NextResponse.json(
      errorBody(`'source_type' inválido. Valores: ${[...VALID_SOURCE_TYPES].join(", ")}.`, requestId),
      { status: 400, headers: rid },
    );
  }

  const category = body.category as string | undefined;
  if (category && !VALID_CATEGORIES.has(category)) {
    return NextResponse.json(
      errorBody(`'category' inválido. Valores: ${[...VALID_CATEGORIES].join(", ")}.`, requestId),
      { status: 400, headers: rid },
    );
  }

  const reported_status = body.reported_status as string | undefined;
  if (reported_status && !VALID_STATUSES.has(reported_status)) {
    return NextResponse.json(
      errorBody(`'reported_status' inválido. Valores: ${[...VALID_STATUSES].join(", ")}.`, requestId),
      { status: 400, headers: rid },
    );
  }

  const source_platform = body.source_platform as string | undefined;
  if (source_platform && !VALID_PLATFORMS.has(source_platform)) {
    return NextResponse.json(
      errorBody(`'source_platform' inválido. Valores: ${[...VALID_PLATFORMS].join(", ")}.`, requestId),
      { status: 400, headers: rid },
    );
  }

  // Signals with no hospital_id are accepted — reviewer will link them
  const hospital_id = body.hospital_id as string | null ?? null;

  // Content fingerprint for dedup (caller-provided or we skip)
  const content_fingerprint = (body.content_fingerprint as string | null) ?? null;

  // Check for duplicate by fingerprint (idempotency)
  if (content_fingerprint) {
    const svc = getServerSupabase();
    const { data: existing } = await svc
      .from("pending_supply_signals")
      .select("id")
      .eq("content_fingerprint", content_fingerprint)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { signal_id: existing.id, duplicate: true, request_id: requestId },
        { status: 200, headers: rid },
      );
    }
  }

  const svc = getServerSupabase();
  const signalRow = {
    hospital_id,
    category: category ?? null,
    reported_status: reported_status ?? null,
    source_platform: source_platform ?? null,
    source_type,
    capture_url: (body.capture_url as string | null) ?? null,
    capture_timestamp: (body.capture_timestamp as string | null) ?? null,
    content_fingerprint,
    visibility: "internal" as const, // always internal until a reviewer promotes to public
    raw_text: (body.raw_text as string | null) ?? null,
    submitter_source: partner.source,
    partner_id: partner.partnerId,
    review_status: "pending" as const,
    expires_at: (body.expires_at as string | null) ?? null,
  };

  const { data: inserted, error: insertErr } = await svc
    .from("pending_supply_signals")
    .insert(signalRow)
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(errorBody(safeDbError(insertErr), requestId), { status: 503, headers: rid });
  }

  // Audit log
  const meta = requestMeta(req, requestId);
  await svc.from("audit_log").insert({
    partner_id: partner.partnerId,
    source: partner.source,
    action: "CREATE",
    resource_table: "pending_supply_signals",
    resource_id: inserted.id,
    external_id: content_fingerprint,
    before: null,
    after: signalRow,
    request_id: meta.requestId,
    ip: meta.ip,
    user_agent: meta.userAgent,
  });

  return NextResponse.json(
    { signal_id: inserted.id, request_id: requestId },
    { status: 201, headers: rid },
  );
}
