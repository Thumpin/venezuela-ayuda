import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { PUBLIC_CDN_CACHE } from "@/lib/httpCache";
import {
  resolveType,
  parseLimit,
  parseSince,
  buildNextCursor,
} from "@/lib/reports.mjs";

// Puerta de LECTURA del hub central (v1). ABIERTA (sin API key) para maximizar
// difusión; rate-limit best-effort por IP. Lee solo de las vistas `public_*`
// (sin PII — phone_private/contact nunca se exponen), nunca de las tablas crudas.
//
// El `type` es el MISMO conjunto cerrado de la escritura (missing_person,
// checkin, help_request, help_offer, damaged_building). Paginación por cursor
// estable: `since` (created_at|id) + orden created_at asc, desempate por id.

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(req: Request) {
  // Rate-limit best-effort por IP (lectura abierta; el límite blunt-ea abuso).
  const rl = rateLimit(await clientKey("reports"), { limit: 120, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const url = new URL(req.url);
  const resolved = resolveType(url.searchParams.get("type") ?? "");
  if (!resolved.ok) {
    return NextResponse.json(
      { error: "Parámetro 'type' inválido o ausente. Valores: missing_person, checkin, help_request, help_offer, damaged_building." },
      { status: 400 }
    );
  }

  const limit = parseLimit(url.searchParams.get("limit"));
  const since = parseSince(url.searchParams.get("since"));
  const city = url.searchParams.get("city")?.trim() || null;

  // Lectura por la vista pública. Columnas explícitas (resolved.select) → nunca
  // un campo privado. Orden estable created_at asc, desempate por id.
  const svc = getServerSupabase();
  let query = svc
    .from(resolved.view)
    .select(resolved.select)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);

  // missing_person/checkin comparten la vista public_checkins; se separan por status.
  if (resolved.status) query = query.in("status", resolved.status);

  // Cursor keyset: created_at > c OR (created_at = c AND id > cid). Sin id en el
  // cursor (timestamp pelón) cae a un gt simple.
  if (since) {
    if (since.id) {
      query = query.or(
        `created_at.gt.${since.createdAt},and(created_at.eq.${since.createdAt},id.gt.${since.id})`
      );
    } else {
      query = query.gt("created_at", since.createdAt);
    }
  }

  if (city) query = query.ilike("city", `%${city}%`);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Servicio no disponible." }, { status: 503 });
  }

  // Cache en el Edge de Vercel sólo en el camino feliz (200). Los errores
  // (400/429/503) ya retornaron arriba sin Cache-Control, a propósito.
  const reports = data ?? [];
  return NextResponse.json(
    { reports, next_cursor: buildNextCursor(reports, limit) },
    { headers: { "Cache-Control": PUBLIC_CDN_CACHE } }
  );
}
