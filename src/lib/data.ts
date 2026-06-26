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
import { HELP_CATEGORIES, OFFER_CATEGORIES, DAMAGE_SEVERITY } from "@/lib/constants";
import type { HelpCity, HelpNeed } from "@/lib/helpAbroad";
import { formatItems } from "@/lib/validation";
import { getDamagedBuildingMarkers } from "@/lib/damagedBuildings";
import { getKoboDamagedMarkers } from "@/lib/koboBuildings";
import { parseCsv, norm } from "@/lib/csv";

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
  const { data } = await query;
  return (data ?? []) as PublicCollectionCenter[];
}

// Venezuela centers as map markers (kind "center").
async function reliefCenterMarkers(): Promise<MapMarker[]> {
  const centers = await getCollectionCenters(VENEZUELA);
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
        `${c.address ?? c.name} ${c.state ?? ""} Venezuela`,
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
      phone: c.contact ?? undefined,
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
  if (error) return [];
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
  if (error) return [];
  return (data ?? []) as PublicHelpRequest[];
}

// External hospital / Cruz Roja patient registry, maintained as a public Google
// Sheet (a consolidated roster of people currently in hospitals). We search it
// alongside the app's own data so a family can find a relative who only appears
// in the official roster. The gviz CSV endpoint works without publishing the
// sheet; on any failure we return [] so the rest of the search page is unaffected.
const HOSPITAL_REGISTRY_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1fRQ3zEkIFMV2SYEjQiCuwewKAJDSixRepzBUf3ZFqf4/gviz/tq?tqx=out:csv&gid=963077964";

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

  let text: string;
  try {
    const res = await fetch(HOSPITAL_REGISTRY_CSV_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 120 }, // near-realtime, but don't hammer Google
    });
    if (!res.ok) return [];
    text = await res.text();
  } catch {
    return [];
  }

  const rows = parseCsv(text);
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

export async function searchMissingPersonsApi(params: {
  q?: string;
  city?: string;
  limit?: number;
}): Promise<MissingPersonMatch[]> {
  const term = (params.q || params.city || "").trim();
  if (term.length < 2) return [];

  let data: { items?: unknown[] };
  try {
    const url =
      `${MISSING_PERSONS_API}?q=${encodeURIComponent(term)}` +
      `&page=1&pageSize=${params.limit ?? 20}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 120 }, // per-query cache; don't hammer the source
    });
    if (!res.ok) return [];
    data = await res.json();
  } catch {
    return [];
  }

  const items = Array.isArray(data.items) ? data.items : [];
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
  if (error) return [];
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

// KoboToolbox damaged-building reports are merged into the map last and deduped
// against the other "damaged" sources by geolocation: a Kobo record within
// ~75 m of an already-present damaged marker is assumed to be the same building
// and dropped. Reuses haversineKm above.
const DUP_RADIUS_KM = 0.075;

// Kobo markers that are NOT within ~75 m of an existing damaged marker (i.e. not
// the same building). Shared by the map merge and the stats count so both dedupe
// identically.
function dedupeKobo(kobo: MapMarker[], existingDamaged: MapMarker[]): MapMarker[] {
  return kobo.filter(
    (k) =>
      !existingDamaged.some(
        (d) =>
          haversineKm({ lat: k.lat, lng: k.lng }, { lat: d.lat, lng: d.lng }) <=
          DUP_RADIUS_KM,
      ),
  );
}

async function mergeKoboDamaged(markers: MapMarker[]): Promise<void> {
  const existing = markers.filter((m) => m.kind === "damaged");
  const kobo = await getKoboDamagedMarkers();
  markers.push(...dedupeKobo(kobo, existing));
}

export type MatchedRequest = PublicHelpRequest & { distanceKm?: number };

export async function getMatchingRequests(params: {
  categories?: string[];
  lat?: number;
  lng?: number;
  city?: string;
  limit?: number;
}): Promise<MatchedRequest[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getServerSupabase();
  let query = supabase
    .from("public_help_requests")
    .select("*")
    .neq("status", "RESOLVED")
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 150);
  if (params.categories && params.categories.length)
    query = query.in("category", params.categories);
  if (params.city) query = query.ilike("city", `%${escapeLike(params.city)}%`);

  const { data, error } = await query;
  if (error) return [];
  const rows = (data ?? []) as MatchedRequest[];

  const hasCoords =
    Number.isFinite(params.lat) && Number.isFinite(params.lng);
  if (hasCoords) {
    const origin = { lat: params.lat as number, lng: params.lng as number };
    for (const r of rows) {
      if (r.latitude != null && r.longitude != null)
        r.distanceKm = haversineKm(origin, { lat: r.latitude, lng: r.longitude });
    }
    rows.sort((a, b) => {
      if (a.distanceKm == null) return b.distanceKm == null ? 0 : 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  }
  return rows;
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
  if (error || !data) return null;
  return data as PublicDamagedReport;
}

// Community-reported damaged buildings (from the DB view). Separate from the
// curated spreadsheet markers in getDamagedBuildingMarkers(); both use kind
// "damaged" intentionally.
export async function getDamagedReportMarkers(): Promise<MapMarker[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getServerSupabase();
  const { data } = await supabase
    .from("public_damaged_reports")
    .select(
      "id,place_name,description,severity,city,latitude,longitude,photo_url,status,created_at,verified_at,source",
    )
    .not("latitude", "is", null)
    .neq("status", "RESOLVED")
    .order("created_at", { ascending: false })
    .limit(2000);

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
  // Curated relief centers + damaged-building reports are always shown, even if
  // the DB is unavailable. These run in parallel and fail soft.
  const externalMarkers = [
    await reliefCenterMarkers(),
    await getDamagedBuildingMarkers(),
  ].flat();
  if (!isSupabaseConfigured()) {
    const markers = [...externalMarkers];
    await mergeKoboDamaged(markers);
    return markers;
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
      subtitle: (o.description ?? o.city ?? undefined)?.slice(0, 120),
      href: "/mapa",
    });
  }

  markers.push(...(await getDamagedReportMarkers()));

  // Kobo last, so it dedupes against both the sheet and the DB damaged markers.
  await mergeKoboDamaged(markers);

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
  const [safe, missing, found, requests, helpers, damaged, sheet, dbDamaged, kobo] = await Promise.all([
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
    supabase.from("public_damaged_reports").select("id", count()).neq("status", "RESOLVED"),
    // Curated spreadsheet damaged buildings (cached fetch — deduped with the map).
    getDamagedBuildingMarkers(),
    // DB damaged markers (coords) — used only to dedupe Kobo against, same as the map.
    getDamagedReportMarkers(),
    // KoboToolbox damaged buildings (cached fetch).
    getKoboDamagedMarkers(),
  ]);
  // Count only Kobo buildings that aren't already in the sheet or DB (geo-dedupe,
  // identical to the map) so the headline stat doesn't double-count.
  const koboNew = dedupeKobo(kobo, [...sheet, ...dbDamaged]);
  return {
    safe: safe.count ?? 0,
    missing: missing.count ?? 0,
    found: found.count ?? 0,
    requests: requests.count ?? 0,
    helpers: helpers.count ?? 0,
    damaged: (damaged.count ?? 0) + sheet.length + koboNew.length,
  };
}

export async function listRequests(limit = 100): Promise<PublicHelpRequest[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getServerSupabase();
  const { data } = await supabase
    .from("public_help_requests")
    .select("*")
    .neq("status", "RESOLVED")
    .order("created_at", { ascending: false })
    .limit(limit);
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
