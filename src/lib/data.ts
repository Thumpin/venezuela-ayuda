import "server-only";
import { unstable_cache } from "next/cache";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import type {
  PublicCheckin,
  PublicHelpRequest,
  PublicHelpOffer,
  PublicDamagedReport,
  PublicCollectionCenter,
  HospitalRegistryMatch,
  MissingPersonMatch,
  MapMarker,
  LatLng,
} from "@/lib/types";
import {
  HELP_CATEGORIES,
  OFFER_CATEGORIES,
  DAMAGE_SEVERITY,
  URGENCY_LEVELS,
  type UrgencyLevel,
  type HelpCategory,
} from "@/lib/constants";
import type { HelpCity, HelpNeed } from "@/lib/helpAbroad";
import { formatItems } from "@/lib/validation";
import { parseCsv, norm } from "@/lib/csv";
import { logWarn } from "@/lib/log.mjs";

const VENEZUELA = "Venezuela";

// Collection centers ("centros de acopio") — verified rows from the DB. Venezuela
// centers go on the map; the rest are listed on /ayudar-fuera. Reads the public
// view (contact/website are public org info; manage_token is never exposed).
export async function getCollectionCenters(
  country?: string,
): Promise<PublicCollectionCenter[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getServerSupabase();
  let query = supabase
    .from("public_collection_centers")
    .select("*")
    .order("country", { ascending: true })
    .order("city", { ascending: true });
  if (country) query = query.eq("country", country);
  const { data, error } = await query;
  if (error) logWarn("supabase_read_failed", { scope: "data.getCollectionCenters", view: "public_collection_centers" }, error);
  return (data ?? []) as PublicCollectionCenter[];
}

// Collection centers as map markers (kind "center") — Venezuela and international
// alike. Any center with coordinates gets a pin; international centers also remain
// in the /ayudar-fuera list.
async function reliefCenterMarkers(): Promise<MapMarker[]> {
  const centers = await getCollectionCenters();
  return centers
    .filter((c) => c.latitude != null && c.longitude != null)
    .map((c) => ({
      id: `center_${c.id}`,
      kind: "center" as const,
      lat: c.latitude!,
      lng: c.longitude!,
      title: c.name,
      subtitle: [c.address, c.resources].filter(Boolean).join(" · ") || undefined,
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [c.address ?? c.name, c.state ?? c.city ?? "", c.country].filter(Boolean).join(" "),
      )}`,
    }));
}

// International centers grouped by country+city, in the shape /ayudar-fuera expects.
export async function getAbroadCenters(): Promise<HelpCity[]> {
  const centers = (await getCollectionCenters()).filter((c) => c.country !== VENEZUELA);
  const byCity = new Map<string, HelpCity>();
  for (const c of centers) {
    const key = `${c.country}|${c.city ?? ""}`;
    if (!byCity.has(key)) {
      byCity.set(key, { city: c.city ?? c.country, country: c.country, places: [] });
    }
    byCity.get(key)!.places.push({
      name: c.name,
      description: c.description ?? undefined,
      address: c.address ?? "",
      website: c.website ?? undefined,
      phone: c.contact ?? undefined, // org contact (public for centers), never a person
      resources: c.resources ?? undefined,
      canShip: c.can_ship_to_venezuela ?? undefined,
      needsVolunteers: c.needs_volunteers ?? undefined,
      volunteersCount: c.volunteers_count ?? undefined,
      mapsQuery:
        c.latitude != null && c.longitude != null
          ? `${c.latitude},${c.longitude}`
          : [c.address, c.city, c.country].filter(Boolean).join(", ") || undefined,
      needs: (c.needs as HelpNeed[]) ?? [],
    });
  }
  return [...byCity.values()];
}

// All reads go through the public_* views, which never include phone/contact.

export async function searchCheckins(params: {
  q?: string;
  city?: string;
  limit?: number;
}): Promise<PublicCheckin[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getServerSupabase();
  let query = supabase
    .from("public_checkins")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 60);

  // ilike with escaped wildcards to avoid pattern-injection.
  if (params.q)
    query = query.or(
      `name.ilike.%${escapeLike(params.q)}%,place_name.ilike.%${escapeLike(params.q)}%`,
    );
  if (params.city) query = query.ilike("city", `%${escapeLike(params.city)}%`);

  const { data, error } = await query;
  if (error) {
    logWarn("supabase_read_failed", { scope: "data.searchCheckins", view: "public_checkins" }, error);
    return [];
  }
  return (data ?? []) as PublicCheckin[];
}

export async function searchHelpRequests(params: {
  q?: string;
  city?: string;
  limit?: number;
}): Promise<PublicHelpRequest[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getServerSupabase();
  let query = supabase
    .from("public_help_requests")
    .select("*")
    .neq("status", "RESOLVED")
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 40);

  // ilike with escaped wildcards to avoid pattern-injection.
  if (params.q)
    query = query.or(
      `place_name.ilike.%${escapeLike(params.q)}%,description.ilike.%${escapeLike(params.q)}%`,
    );
  if (params.city) query = query.ilike("city", `%${escapeLike(params.city)}%`);

  const { data, error } = await query;
  if (error) {
    logWarn("supabase_read_failed", { scope: "data.searchHelpRequests", view: "public_help_requests" }, error);
    return [];
  }
  return (data ?? []) as PublicHelpRequest[];
}

// External hospital / Cruz Roja patient registry, maintained as a public Google
// Sheet (a consolidated roster of people currently in hospitals). We search it
// alongside the app's own data so a family can find a relative who only appears
// in the official roster. The gviz CSV endpoint works without publishing the
// sheet; on any failure we return [] so the rest of the search page is unaffected.
const HOSPITAL_REGISTRY_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1fRQ3zEkIFMV2SYEjQiCuwewKAJDSixRepzBUf3ZFqf4/gviz/tq?tqx=out:csv&gid=963077964";

// Fetch + parse the whole sheet ONCE and cache the parsed ROWS (not the response
// stream). We cache the result via unstable_cache and fetch with `no-store`, so
// Next never caches the response body — that response-stream cache was what threw
// `transformAlgorithm` / `terminated` / "Failed to set fetch cache" when Google
// closed the socket mid-stream. AbortSignal.timeout bounds a hung connection.
const loadHospitalRegistryRows = unstable_cache(
  async (): Promise<string[][]> => {
    try {
      const res = await fetch(HOSPITAL_REGISTRY_CSV_URL, {
        // `Accept-Encoding: identity` asks for an UNCOMPRESSED response. With no
        // gzip/br decompression transform, aborting/interrupting the stream can't
        // trip undici's `controller[kState].transformAlgorithm is not a function`
        // bug (Node 22.x). Timeout still bounds a hung connection.
        headers: { "User-Agent": "Mozilla/5.0", "Accept-Encoding": "identity" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        logWarn("external_fetch_failed", { scope: "data.hospitalRegistry", status: res.status });
        return [];
      }
      return parseCsv(await res.text());
    } catch (err) {
      logWarn("external_fetch_failed", { scope: "data.hospitalRegistry" }, err);
      return [];
    }
  },
  ["hospital-registry-rows"],
  { revalidate: 120 },
);

export async function searchHospitalRegistry(params: {
  q?: string;
  city?: string;
  limit?: number;
}): Promise<HospitalRegistryMatch[]> {
  const nameTokens = norm(params.q ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const cityQuery = norm(params.city ?? "");
  if (nameTokens.length === 0 && cityQuery.length === 0) return [];

  const rows = await loadHospitalRegistryRows();
  if (rows.length < 2) return [];

  // Resolve columns by normalized header so reordering the sheet can't break us.
  const header = rows[0].map(norm);
  const col = (name: string) => header.findIndex((h) => h === name);
  const iId = col("id");
  const iHospital = col("hospital");
  const iName = col("nombre_completo");
  const iSearch = col("nombre_busqueda");
  const iAge = col("edad");
  const iAddr = col("direccion");
  const iStatus = col("estado");
  const iUpdated = col("fecha_actualizacion");
  const iSource = col("fuente");

  const get = (row: string[], i: number) =>
    i >= 0 && i < row.length ? row[i].trim() : "";

  const limit = params.limit ?? 40;
  const out: HospitalRegistryMatch[] = [];

  for (let r = 1; r < rows.length && out.length < limit; r++) {
    const row = rows[r];
    const name = get(row, iName);
    if (!name) continue;

    if (nameTokens.length) {
      const haystack = get(row, iSearch) || norm(name);
      if (!nameTokens.every((t) => haystack.includes(t))) continue;
    }
    if (cityQuery && !norm(get(row, iAddr)).includes(cityQuery)) continue;

    out.push({
      id: get(row, iId) || `reg-${r}`,
      name,
      hospital: get(row, iHospital),
      location: get(row, iAddr) || null,
      age: get(row, iAge) || null,
      status: get(row, iStatus) || null,
      source: get(row, iSource) || null,
      updated: get(row, iUpdated) || null,
    });
  }

  return out;
}

// Live search against the public missing-persons API (desaparecidosterremoto).
// Its `q` matches both name and location, so one term covers the name-or-city
// trigger. We keep only the privacy-safe fields (no `contacto`). Any failure —
// the source 429s under load — returns [] so the rest of the page is unaffected.
const MISSING_PERSONS_API =
  "https://desaparecidos-terremoto-api.theempire.tech/api/personas";

// Per-query fetch, but we cache the RESULT (unstable_cache) and fetch `no-store`
// so Next never caches the flaky response stream (same fix as the hospital sheet).
const fetchMissingPersonsItems = unstable_cache(
  async (term: string, limit: number): Promise<unknown[]> => {
    try {
      const url =
        `${MISSING_PERSONS_API}?q=${encodeURIComponent(term)}&page=1&pageSize=${limit}`;
      const res = await fetch(url, {
        // Uncompressed response (see hospital-registry note): avoids undici's
        // decompression-transform crash when an aborted/interrupted stream is torn down.
        headers: { "User-Agent": "Mozilla/5.0", "Accept-Encoding": "identity" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        logWarn("external_fetch_failed", { scope: "data.missingPersonsApi", status: res.status });
        return [];
      }
      const data = (await res.json()) as { items?: unknown[] };
      return Array.isArray(data.items) ? data.items : [];
    } catch (err) {
      logWarn("external_fetch_failed", { scope: "data.missingPersonsApi" }, err);
      return [];
    }
  },
  ["missing-persons-api"],
  { revalidate: 120 },
);

export async function searchMissingPersonsApi(params: {
  q?: string;
  city?: string;
  limit?: number;
}): Promise<MissingPersonMatch[]> {
  const term = (params.q || params.city || "").trim();
  if (term.length < 2) return [];

  const items = await fetchMissingPersonsItems(term, params.limit ?? 20);
  const out: MissingPersonMatch[] = [];
  for (const raw of items) {
    const p = raw as Record<string, unknown>;
    const name = typeof p.nombre === "string" ? p.nombre.trim() : "";
    if (!name) continue;
    const str = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim() : null;
    // Prefer an epoch timestamp (precise → "hace X min"); fall back to day-only fecha.
    const epoch =
      typeof p.updatedAt === "number"
        ? p.updatedAt
        : typeof p.createdAt === "number"
          ? p.createdAt
          : null;
    out.push({
      id: str(p.id) ?? `dtv-${out.length}`,
      name,
      location: str(p.ubicacion),
      description: str(p.descripcion),
      photoUrl: str(p.foto),
      located: p.estado === "localizado",
      date: epoch !== null ? new Date(epoch).toISOString() : str(p.fecha),
      sourceUrl: "https://desaparecidosterremotovenezuela.com",
    });
  }
  return out;
}

// Missing people who have a photo — for the "recognize by face" gallery.
export async function getMissingWithPhotos(params: {
  city?: string;
  limit?: number;
  offset?: number;
}): Promise<PublicCheckin[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getServerSupabase();
  const limit = params.limit ?? 60;
  const offset = params.offset ?? 0;
  let query = supabase
    .from("public_checkins")
    .select("*")
    .eq("status", "LOOKING_FOR_SOMEONE")
    .is("found_at", null)
    .not("photo_url", "is", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (params.city) query = query.ilike("city", `%${escapeLike(params.city)}%`);
  const { data, error } = await query;
  if (error) {
    logWarn("supabase_read_failed", { scope: "data.getMissingWithPhotos", view: "public_checkins" }, error);
    return [];
  }
  return (data ?? []) as PublicCheckin[];
}

export async function getCheckin(id: string): Promise<PublicCheckin | null> {
  if (!isSupabaseConfigured() || !isUuid(id)) return null;
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("public_checkins")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) logWarn("supabase_read_failed", { scope: "data.getCheckin", view: "public_checkins" }, error);
  if (error || !data) return null;
  return data as PublicCheckin;
}

// Open help requests for volunteer matching: filter by mapped categories, then
// rank by distance from the volunteer (rows without coords go last).
function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Damaged-building reports now come from the DB (damaged_reports). The Kobo form
// and curated Google Sheet are snapshotted into that table by
// scripts/ingest-damaged-buildings.mjs, so the map/stats no longer fetch them
// live — the DB is the single source of truth (durable + moderatable).

export type MatchedRequest = PublicHelpRequest & {
  distanceKm?: number;
  responseCount?: number; // volunteers who already offered (count only, no PII)
};

export async function getMatchingRequests(params: {
  categories?: string[];
  lat?: number;
  lng?: number;
  city?: string;
  status?: string; // "OPEN" | "IN_PROGRESS" to narrow; otherwise both (non-resolved)
  limit?: number;
}): Promise<MatchedRequest[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getServerSupabase();
  let query = supabase
    .from("public_help_requests")
    .select("*")
    .neq("status", "RESOLVED")
    .limit(params.limit ?? 150);
  if (params.status === "OPEN" || params.status === "IN_PROGRESS")
    query = query.eq("status", params.status);
  if (params.categories && params.categories.length) {
    const categories = params.categories.filter((c): c is HelpCategory => c in HELP_CATEGORIES);
    if (categories.length) query = query.in("category", categories);
  }
  if (params.city) query = query.ilike("city", `%${escapeLike(params.city)}%`);

  const { data, error } = await query;
  if (error) {
    logWarn("supabase_read_failed", { scope: "data.getMatchingRequests", view: "public_help_requests" }, error);
    return [];
  }
  const rows = (data ?? []) as MatchedRequest[];

  // How many volunteers already offered (so the list doesn't pile onto handled
  // needs). Count only — responder PII stays private to the requester.
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    const { data: resp, error: respErr } = await supabase
      .from("request_responses")
      .select("request_id")
      .in("request_id", ids);
    if (respErr) logWarn("supabase_read_failed", { scope: "data.getMatchingRequests.responseCounts", view: "request_responses" }, respErr);
    const counts = new Map<string, number>();
    for (const r of (resp ?? []) as { request_id: string }[])
      counts.set(r.request_id, (counts.get(r.request_id) ?? 0) + 1);
    for (const r of rows) r.responseCount = counts.get(r.id) ?? 0;
  }

  const hasCoords = Number.isFinite(params.lat) && Number.isFinite(params.lng);
  if (hasCoords) {
    const origin = { lat: params.lat as number, lng: params.lng as number };
    for (const r of rows)
      if (r.latitude != null && r.longitude != null)
        r.distanceKm = haversineKm(origin, { lat: r.latitude, lng: r.longitude });
  }

  // Rank by URGENCY first (critical needs bubble up), then nearest when we have
  // the volunteer's location, then most recent. Distance-only sorting buried
  // critical-but-far requests below trivial-but-near ones.
  const weight = (u: MatchedRequest["urgency"]) => URGENCY_LEVELS[u]?.weight ?? 0;
  rows.sort((a, b) => {
    const du = weight(b.urgency) - weight(a.urgency);
    if (du !== 0) return du;
    if (hasCoords) {
      const da = a.distanceKm ?? Infinity;
      const db = b.distanceKm ?? Infinity;
      if (da !== db) return da - db;
    }
    return a.created_at < b.created_at ? 1 : -1;
  });
  return rows;
}

// Unified "active needs" list: people needing help (checkins NEEDS_HELP), missing
// people being searched (LOOKING_FOR_SOMEONE), and place/structured requests
// (help_requests). Normalized to one shape so a single browse page can list them
// with kind/category/city filters.
export type NeedKind = "persona" | "lugar" | "desaparecido";

export interface ActiveNeed {
  kind: NeedKind;
  id: string;
  title: string;
  subtitle: string | null;
  city: string | null;
  urgency: UrgencyLevel | null; // only lugares carry urgency
  category: HelpCategory | null;
  href: string;
  created_at: string;
  responseCount?: number;
}

const NEED_LIMIT = 80;
type CheckinLite = {
  id: string; name: string; city: string | null;
  message: string | null; place_name: string | null; created_at: string;
};

export async function getActiveNeeds(
  params: { kind?: NeedKind; category?: string; city?: string } = {},
): Promise<ActiveNeed[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getServerSupabase();
  const city = params.city?.trim();
  const want = (k: NeedKind) => !params.kind || params.kind === k;
  // PromiseLike: the Supabase query builder is thenable but not a full Promise.
  const tasks: PromiseLike<ActiveNeed[]>[] = [];

  if (want("persona")) {
    let q = supabase
      .from("public_checkins")
      .select("id,name,city,message,place_name,created_at")
      .eq("status", "NEEDS_HELP")
      .order("created_at", { ascending: false })
      .limit(NEED_LIMIT);
    if (city) q = q.ilike("city", `%${escapeLike(city)}%`);
    tasks.push(
      q.then(({ data, error }) => {
        if (error) logWarn("supabase_read_failed", { scope: "data.getActiveNeeds.persona", view: "public_checkins" }, error);
        return ((data ?? []) as CheckinLite[]).map((c) => ({
          kind: "persona" as const, id: c.id, title: c.name,
          subtitle: c.message ?? c.place_name ?? null, city: c.city,
          urgency: null, category: null, href: `/persona/${c.id}`, created_at: c.created_at,
        }));
      }),
    );
  }

  if (want("desaparecido")) {
    let q = supabase
      .from("public_checkins")
      .select("id,name,city,message,place_name,created_at")
      .eq("status", "LOOKING_FOR_SOMEONE")
      .is("found_at", null)
      .order("created_at", { ascending: false })
      .limit(NEED_LIMIT);
    if (city) q = q.ilike("city", `%${escapeLike(city)}%`);
    tasks.push(
      q.then(({ data, error }) => {
        if (error) logWarn("supabase_read_failed", { scope: "data.getActiveNeeds.desaparecido", view: "public_checkins" }, error);
        return ((data ?? []) as CheckinLite[]).map((c) => ({
          kind: "desaparecido" as const, id: c.id, title: c.name,
          subtitle: c.city ? `Última ubicación: ${c.city}` : c.message ?? null, city: c.city,
          urgency: null, category: null, href: `/persona/${c.id}`, created_at: c.created_at,
        }));
      }),
    );
  }

  if (want("lugar")) {
    tasks.push(
      getMatchingRequests({
        categories: params.category ? [params.category] : undefined,
        city,
        limit: NEED_LIMIT,
      }).then((rows) =>
        rows.map((r) => ({
          kind: "lugar" as const, id: r.id,
          title: r.place_name || (HELP_CATEGORIES[r.category]?.label ?? r.category),
          subtitle: r.description ?? null, city: r.city,
          urgency: r.urgency, category: r.category, href: `/solicitud/${r.id}`,
          created_at: r.created_at, responseCount: r.responseCount,
        })),
      ),
    );
  }

  const all = (await Promise.all(tasks)).flat();
  // Urgent place-requests first, then most recent across all kinds.
  const w = (u: UrgencyLevel | null) => (u ? URGENCY_LEVELS[u].weight : 0);
  all.sort((a, b) => {
    const du = w(b.urgency) - w(a.urgency);
    if (du !== 0) return du;
    return a.created_at < b.created_at ? 1 : -1;
  });
  return all;
}

export async function getHelpRequest(
  id: string,
): Promise<PublicHelpRequest | null> {
  if (!isSupabaseConfigured() || !isUuid(id)) return null;
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("public_help_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) logWarn("supabase_read_failed", { scope: "data.getHelpRequest", view: "public_help_requests" }, error);
  if (error || !data) return null;
  return data as PublicHelpRequest;
}

export async function getDamagedReport(
  id: string,
): Promise<PublicDamagedReport | null> {
  if (!isSupabaseConfigured() || !isUuid(id)) return null;
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("public_damaged_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) logWarn("supabase_read_failed", { scope: "data.getDamagedReport", view: "public_damaged_reports" }, error);
  if (error || !data) return null;
  return data as PublicDamagedReport;
}

// Damaged buildings from the DB view — the single source now, covering community
// reports plus the Kobo/sheet rows snapshotted in by the ingest script.
export async function getDamagedReportMarkers(): Promise<MapMarker[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("public_damaged_reports")
    .select(
      "id,place_name,description,severity,city,latitude,longitude,photo_url,status,created_at,verified_at,source",
    )
    .not("latitude", "is", null)
    .neq("status", "RESOLVED")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) logWarn("supabase_read_failed", { scope: "data.getDamagedReportMarkers", view: "public_damaged_reports" }, error);

  return ((data ?? []) as PublicDamagedReport[]).map((r) => ({
    id: `dr_${r.id}`,
    kind: "damaged",
    lat: r.latitude!,
    lng: r.longitude!,
    title: r.place_name,
    subtitle: `${DAMAGE_SEVERITY[r.severity]?.label ?? r.severity}${
      r.description ? ` — ${r.description.slice(0, 100)}` : ""
    }`,
    confidence: r.verified_at
      ? "✅ Verificado por un administrador"
      : r.source
        ? `Fuente: ${r.source} (sin verificar)`
        : "Reporte de la comunidad (sin verificar)",
    href: `/edificio/${r.id}`,
    color: DAMAGE_SEVERITY[r.severity]?.color, // pin colored by severity
  }));
}

async function getMapMarkersUncached(): Promise<MapMarker[]> {
  // Relief centers are curated and shown even if the DB is unavailable.
  const externalMarkers = await reliefCenterMarkers();
  if (!isSupabaseConfigured()) {
    return [...externalMarkers];
  }
  const supabase = getServerSupabase();

  const [checkins, requests, offers] = await Promise.all([
    supabase
      .from("public_checkins")
      .select("id,name,status,city,latitude,longitude,message,created_at,found_at,source")
      .not("latitude", "is", null)
      .neq("status", "SAFE")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("public_help_requests")
      .select(
        "id,category,description,urgency,city,latitude,longitude,status,created_at,place_name,items,source",
      )
      .not("latitude", "is", null)
      .neq("status", "RESOLVED")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("public_help_offers")
      .select("id,category,description,city,latitude,longitude,available,created_at")
      .not("latitude", "is", null)
      .eq("available", true)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  for (const [view, res] of [
    ["public_checkins", checkins],
    ["public_help_requests", requests],
    ["public_help_offers", offers],
  ] as const) {
    if (res.error) logWarn("supabase_read_failed", { scope: "data.getMapMarkers", view }, res.error);
  }

  const markers: MapMarker[] = [...externalMarkers];

  for (const c of (checkins.data ?? []) as PublicCheckin[]) {
    if (c.status === "NEEDS_HELP") {
      markers.push({
        id: `c_${c.id}`,
        kind: "need",
        lat: c.latitude!,
        lng: c.longitude!,
        title: c.name,
        subtitle: c.city ?? c.message ?? undefined,
        href: `/persona/${c.id}`,
        source: c.source ?? undefined,
        approx: c.source ? true : undefined,
      });
    } else if (c.status === "LOOKING_FOR_SOMEONE") {
      if (c.found_at) continue;
      markers.push({
        id: `c_${c.id}`,
        kind: "missing",
        lat: c.latitude!,
        lng: c.longitude!,
        title: c.name,
        subtitle: c.city ? `Última ubicación: ${c.city}` : c.message ?? undefined,
        href: `/persona/${c.id}`,
        source: c.source ?? undefined,
        approx: c.source ? true : undefined,
      });
    }
  }

  for (const r of (requests.data ?? []) as PublicHelpRequest[]) {
    const items = formatItems(r.items);
    const subtitle = [r.description?.slice(0, 120), items ? `🛠️ ${items}` : ""]
      .filter(Boolean)
      .join(" · ");
    markers.push({
      id: `r_${r.id}`,
      kind: "need",
      lat: r.latitude!,
      lng: r.longitude!,
      title: r.place_name || (HELP_CATEGORIES[r.category]?.label ?? r.category),
      subtitle: subtitle || undefined,
      href: `/solicitud/${r.id}`,
      source: r.source ?? undefined,
    });
  }

  for (const o of (offers.data ?? []) as PublicHelpOffer[]) {
    markers.push({
      id: `o_${o.id}`,
      kind: "helper",
      lat: o.latitude!,
      lng: o.longitude!,
      title: `Ofrece: ${OFFER_CATEGORIES[o.category]?.label ?? o.category}`,
      // Show the available info IN the popup — offers have no detail page and the
      // contact is private, so there's nothing to navigate to. `href: ""` makes
      // MapView render no link (previously "/mapa", which just reloaded the map).
      subtitle:
        [o.description, o.city, o.availability].filter(Boolean).join(" · ").slice(0, 200) ||
        undefined,
      href: "",
    });
  }

  markers.push(...(await getDamagedReportMarkers()));

  return markers;
}

export interface Stats {
  safe: number;
  missing: number;
  found: number;
  requests: number;
  helpers: number;
  damaged: number;
}

const ZERO_STATS: Stats = { safe: 0, missing: 0, found: 0, requests: 0, helpers: 0, damaged: 0 };

// Lightweight COUNT(*) per category for the landing strip. `head: true` fetches
// no rows — just the counts.
async function getStatsUncached(): Promise<Stats> {
  if (!isSupabaseConfigured()) return ZERO_STATS;
  const supabase = getServerSupabase();
  const count = () => ({ count: "exact" as const, head: true });
  const [safe, missing, found, requests, helpers, damaged] = await Promise.all([
    supabase.from("public_checkins").select("id", count()).eq("status", "SAFE"),
    supabase
      .from("public_checkins")
      .select("id", count())
      .eq("status", "LOOKING_FOR_SOMEONE")
      .is("found_at", null),
    supabase
      .from("public_checkins")
      .select("id", count())
      .eq("status", "LOOKING_FOR_SOMEONE")
      .not("found_at", "is", null),
    supabase.from("public_help_requests").select("id", count()).neq("status", "RESOLVED"),
    supabase.from("public_help_offers").select("id", count()).eq("available", true),
    // Damaged buildings now live entirely in the DB (Kobo + sheet snapshotted in).
    supabase.from("public_damaged_reports").select("id", count()).neq("status", "RESOLVED"),
  ]);
  for (const res of [safe, missing, found, requests, helpers, damaged]) {
    if (res.error) {
      logWarn("supabase_read_failed", { scope: "data.getStats" }, res.error);
      break; // un solo aviso por refresh; todas comparten la misma causa raíz
    }
  }
  return {
    safe: safe.count ?? 0,
    missing: missing.count ?? 0,
    found: found.count ?? 0,
    requests: requests.count ?? 0,
    helpers: helpers.count ?? 0,
    damaged: damaged.count ?? 0,
  };
}

export async function listRequests(limit = 100): Promise<PublicHelpRequest[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("public_help_requests")
    .select("*")
    .neq("status", "RESOLVED")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) logWarn("supabase_read_failed", { scope: "data.listRequests", view: "public_help_requests" }, error);
  return (data ?? []) as PublicHelpRequest[];
}

// Helpers -------------------------------------------------------------------
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&").slice(0, 80);
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// Cache the heavy homepage/map data fetches (~thousands of rows) for 60s so
// re-renders — e.g. the language toggle's router.refresh() — reuse the result
// instead of re-querying Supabase. Data is locale-independent, so this is safe.
export const getMapMarkers = unstable_cache(getMapMarkersUncached, ["map-markers"], {
  revalidate: 60,
});
export const getStats = unstable_cache(getStatsUncached, ["home-stats"], {
  revalidate: 60,
});
