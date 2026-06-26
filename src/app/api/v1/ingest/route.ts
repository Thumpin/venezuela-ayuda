import { NextResponse } from "next/server";
import { createAuthenticator } from "@/lib/apiAuth.mjs";
import { buildRow, INGEST_TABLES } from "@/lib/ingest.mjs";
import { getServerSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";

// Puerta de ingesta del hub central (v1). Cerrada por API key (`x-api-key`);
// escribe con el service key (alineado con 0013). El `source` se estampa desde
// la key, nunca desde el body.

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BATCH = 200;
const MAX_BODY_BYTES = 512 * 1024; // req.json() bufferea todo el body antes del cap de batch

// Autenticador a nivel de módulo → su cache (key_hash → partner) sobrevive entre
// requests del mismo lambda. fetchByHash LANZA en error de DB (no devuelve null)
// para no cachear un fallo transitorio como miss.
const authenticate = createAuthenticator(async (hash: string) => {
  const svc = getServerSupabase();
  const { data, error } = await svc
    .from("api_partners")
    .select("id, source, scopes")
    .eq("key_hash", hash)
    .eq("active", true)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { partnerId: data.id as string, source: data.source as string, scopes: (data.scopes as string[]) ?? [] };
});

type IngestStatus = "upserted" | "rejected" | "error";
type IngestResult = { external_id: string | null; status: IngestStatus; error?: string };
// buildRow es JS (.mjs); tipamos su retorno acá para que el narrowing por `ok` funcione.
type Built = { ok: true; table: string; row: Record<string, unknown> } | { ok: false; error: string };

export async function POST(req: Request) {
  // Auth. Un fallo de DB en el lookup → 503 (fail closed), nunca 200/escritura.
  let partner: { partnerId: string; source: string; scopes: string[] } | null;
  try {
    partner = await authenticate(req.headers.get("x-api-key"));
  } catch {
    return NextResponse.json({ error: "Servicio no disponible." }, { status: 503 });
  }
  if (!partner) {
    return NextResponse.json({ error: "API key inválida o ausente." }, { status: 401 });
  }
  if (!partner.scopes?.includes("write")) {
    return NextResponse.json({ error: "La key no tiene permiso de escritura." }, { status: 403 });
  }
  const source = partner.source;

  // Rate-limit best-effort por socio (por-lambda; el tope de batch es el backstop real).
  const rl = rateLimit(`ingest:${source}`, { limit: 120, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  // Guard de tamaño antes de parsear (el body se bufferea entero en memoria).
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload demasiado grande." }, { status: 413 });
  }

  let reports: unknown;
  try {
    reports = ((await req.json()) as { reports?: unknown })?.reports;
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  if (!Array.isArray(reports)) {
    return NextResponse.json({ error: "Falta el arreglo 'reports'." }, { status: 400 });
  }
  if (reports.length > MAX_BATCH) {
    return NextResponse.json({ error: `Máximo ${MAX_BATCH} reportes por solicitud.` }, { status: 413 });
  }

  // Validar + rutear. Dedup intra-batch por external_id (el source es constante
  // en el request): Postgres ON CONFLICT no puede tocar la misma fila objetivo
  // dos veces en un comando, así que un external_id repetido en el lote abortaría
  // el upsert entero. Last-wins, coherente con la intención idempotente.
  const results: IngestResult[] = [];
  const byTable: Record<string, Map<string, Record<string, unknown>>> = {};
  for (const rep of reports) {
    const built = buildRow(rep, source) as Built;
    const extId = (rep as { external_id?: string })?.external_id ?? null;
    if (!built.ok) {
      results.push({ external_id: extId, status: "rejected", error: built.error });
      continue;
    }
    (byTable[built.table] ??= new Map()).set(built.row.external_id as string, built.row);
  }

  // Upsert por tabla en paralelo (≤4), idempotente por (source, external_id).
  const svc = getServerSupabase();
  const tables = (INGEST_TABLES as string[]).filter((t) => byTable[t]?.size);
  const outcomes = await Promise.allSettled(
    tables.map((t) => svc.from(t).upsert([...byTable[t].values()], { onConflict: "source,external_id" }))
  );

  let accepted = 0;
  let dbErrors = 0;
  tables.forEach((t, i) => {
    const rows = [...byTable[t].values()];
    const outcome = outcomes[i];
    const dbError =
      outcome.status === "rejected"
        ? "fallo de servicio"
        : outcome.value.error
          ? outcome.value.error.message || "no se pudo guardar"
          : null;
    if (dbError) {
      dbErrors++;
      for (const row of rows) results.push({ external_id: (row.external_id as string) ?? null, status: "error", error: dbError });
    } else {
      accepted += rows.length;
      for (const row of rows) results.push({ external_id: (row.external_id as string) ?? null, status: "upserted" });
    }
  });

  const rejected = results.filter((r) => r.status === "rejected").length;
  const errored = results.filter((r) => r.status === "error").length;
  // Falla total de DB (nada aceptado, hubo errores de DB) → 503 para que el
  // cliente reintente. Rechazos de validación NO disparan 503 (no son retryables).
  const httpStatus = dbErrors > 0 && accepted === 0 ? 503 : 200;
  return NextResponse.json({ accepted, rejected, errored, results }, { status: httpStatus });
}
