// Lógica de lectura del hub: mapea el `type` público (el mismo conjunto cerrado
// del ingest) a una vista `public_*` (sin PII) + filtro de status, y arma el
// cursor de paginación. Puro y testeable (`node --test`): no toca Supabase.
//
// Las vistas ya omiten phone_private/contact (ver migraciones 0006/0007/0012/0014).
// Acá nunca seleccionamos esas columnas — pedimos columnas explícitas por vista.

// type público → { view, status? }. `status` (cuando existe) se aplica como
// filtro server-side: missing_person y checkin comparten la tabla checkins y se
// separan por el status, igual que en la escritura (src/lib/ingest.mjs).
const TYPE_MAP = {
  missing_person: { view: "public_checkins", status: ["LOOKING_FOR_SOMEONE"] },
  checkin: { view: "public_checkins", status: ["SAFE", "NEEDS_HELP"] },
  help_request: { view: "public_help_requests" },
  help_offer: { view: "public_help_offers" },
  damaged_building: { view: "public_damaged_reports" },
};

export const REPORT_TYPES = Object.keys(TYPE_MAP);

// Columnas expuestas por cada vista (sin PII). Pedimos explícito en lugar de `*`
// para no filtrar nunca un campo privado si una vista cambiara.
export const VIEW_COLUMNS = {
  public_checkins: ["id", "name", "status", "city", "latitude", "longitude", "message", "photo_url", "created_at", "found_at", "place_name", "source", "source_url"],
  public_help_requests: ["id", "category", "description", "urgency", "city", "latitude", "longitude", "status", "created_at", "place_name", "items", "source", "source_url"],
  public_help_offers: ["id", "category", "description", "city", "latitude", "longitude", "availability", "available", "created_at", "source", "source_url"],
  public_damaged_reports: ["id", "place_name", "description", "severity", "city", "latitude", "longitude", "photo_url", "status", "created_at", "verified_at", "verified_by", "source", "source_url", "risk_level", "risk_priority"],
};

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

// type → { ok, view, status?, select } | { ok:false }. select es el string para
// PostgREST (columnas explícitas, csv).
export function resolveType(type) {
  const m = TYPE_MAP[type];
  if (!m) return { ok: false };
  return { ok: true, view: m.view, status: m.status ?? null, select: VIEW_COLUMNS[m.view].join(",") };
}

// limit crudo (string|number|null) → entero acotado [1, MAX_LIMIT], default DEFAULT_LIMIT.
export function parseLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

// next_cursor estable: `created_at|id` del último item, o null si la página no
// se llenó (no hay más). El id desempata cuando dos filas comparten created_at,
// para que `since` no salte ni repita filas en el límite del lote.
export function buildNextCursor(rows, limit) {
  if (!rows || rows.length < limit) return null;
  const last = rows[rows.length - 1];
  if (!last || last.created_at == null) return null;
  return `${last.created_at}|${last.id}`;
}

// Parsea el cursor `since` (sea un ISO solo, o `created_at|id`) → { createdAt, id }.
// id es null si el cursor no lo trae (compat con un timestamp pelón).
export function parseSince(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const [createdAt, id] = raw.split("|");
  if (!createdAt) return null;
  return { createdAt, id: id ?? null };
}
