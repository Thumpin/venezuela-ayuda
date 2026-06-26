import { NextResponse } from "next/server";
import { createAuthenticator } from "@/lib/apiAuth.mjs";
import { buildRow, INGEST_TABLES } from "@/lib/ingest.mjs";
import { getServerSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";

// Puerta de ingesta del hub central. Cerrada por API key (`x-api-key`); escribe
// con el service key (alineado con 0013, que dejó la escritura solo server-side).
// El `source` se estampa desde la key, nunca desde el body.

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BATCH = 200;

// Autenticador a nivel de módulo → su cache TTL (key_hash → partner) sobrevive
// entre requests del mismo lambda. Sin esto, cada POST haría un round-trip a la DB.
const authenticate = createAuthenticator(async (hash: string) => {
  const svc = getServerSupabase();
  const { data } = await svc
    .from("api_partners")
    .select("id, source, scopes")
    .eq("key_hash", hash)
    .eq("active", true)
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;
  return { partnerId: data.id as string, source: data.source as string, scopes: (data.scopes as string[]) ?? [] };
});

type IngestResult = { external_id: string | null; status: "upserted" | "rejected" | "error"; error?: string };

export async function POST(req: Request) {
  const partner = await authenticate(req.headers.get("x-api-key"));
  if (!partner) {
    return NextResponse.json({ error: "API key inválida o ausente." }, { status: 401 });
  }
  if (!partner.scopes?.includes("write")) {
    return NextResponse.json({ error: "La key no tiene permiso de escritura." }, { status: 403 });
  }

  // Rate-limit best-effort por socio (por-lambda; el tope de batch es el backstop real).
  const rl = rateLimit(`ingest:${partner.source}`, { limit: 120, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
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

  // Validar + rutear cada reporte a su tabla canónica (source de la key).
  const results: IngestResult[] = [];
  const byTable: Record<string, Record<string, unknown>[]> = {};
  for (const rep of reports) {
    const built = buildRow(rep, partner.source);
    const extId = (rep as { external_id?: string })?.external_id ?? null;
    if (!built.ok) {
      results.push({ external_id: extId, status: "rejected", error: built.error });
      continue;
    }
    (byTable[built.table] ??= []).push(built.row);
  }

  // Upsert por lotes (un round-trip por tabla), idempotente por (source, external_id).
  const svc = getServerSupabase();
  let accepted = 0;
  for (const table of INGEST_TABLES) {
    const rows = byTable[table];
    if (!rows?.length) continue;
    const { error } = await svc.from(table).upsert(rows, { onConflict: "source,external_id" });
    const status: IngestResult["status"] = error ? "error" : "upserted";
    if (!error) accepted += rows.length;
    for (const row of rows) {
      results.push({ external_id: (row.external_id as string) ?? null, status, error: error ? "no se pudo guardar" : undefined });
    }
  }

  const rejected = results.filter((r) => r.status !== "upserted").length;
  return NextResponse.json({ accepted, rejected, results });
}
