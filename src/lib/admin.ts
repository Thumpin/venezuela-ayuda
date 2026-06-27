import "server-only";
import { getAuthClient } from "@/lib/supabase/auth";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";

export async function getAdminEmail(): Promise<string | null> {
  if (process.env.BYPASS_ADMIN_AUTH === "true") {
    return "yerctech@gmail.com";
  }
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "development") return "dev@test.local";
    return null;
  }
  const auth = await getAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  return (await isEmailAdmin(email)) ? email : null;
}

export async function isEmailAdmin(email: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;
  const svc = getServerSupabase();
  const { data } = await svc
    .from("admin_emails")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return Boolean(data);
}

// True only for super-admins (admin_emails.is_super_admin). Super-admins can
// create/remove admins, issue API keys, and run the batch ingest.
export async function isSuperAdmin(email: string): Promise<boolean> {
  const svc = getServerSupabase();
  const { data } = await svc
    .from("admin_emails")
    .select("is_super_admin")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return Boolean(data?.is_super_admin);
}

// One round-trip for the logged-in admin's identity + tier. Returns null if not
// authenticated or not on the allowlist.
export async function getAdminSession(): Promise<{ email: string; isSuper: boolean } | null> {
  const email = await getAdminEmail();
  if (!email) return null;
  return { email, isSuper: await isSuperAdmin(email) };
}

export interface AdminRow {
  email: string;
  added_by: string | null;
  is_super_admin: boolean;
  created_at: string;
}

export async function listAdmins(): Promise<AdminRow[]> {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "development") return [{ email: "dev@test.local", added_by: "seed", created_at: new Date().toISOString() }];
    return [];
  }
  const svc = getServerSupabase();
  const { data } = await svc
    .from("admin_emails")
    .select("email,added_by,is_super_admin,created_at")
    .order("is_super_admin", { ascending: false })
    .order("created_at", { ascending: true });
  return (data ?? []) as AdminRow[];
}

export interface AdminDamagedRow {
  id: string;
  place_name: string;
  severity: string;
  city: string | null;
  description: string | null;
  status: string;
  hidden: boolean;
  verified_at: string | null;
  risk_level: string | null;
  source: string | null;
  created_at: string;
}

export async function listDamagedReportsAdmin(): Promise<AdminDamagedRow[]> {
  const svc = getServerSupabase();
  const { data } = await svc
    .from("damaged_reports")
    .select("id,place_name,severity,city,description,status,hidden,verified_at,risk_level,source,created_at")
    .order("created_at", { ascending: false })
    .limit(400);
  return (data ?? []) as AdminDamagedRow[];
}

export type ModerationTable = "checkins" | "help_requests" | "help_offers";

export interface ModerationItem {
  table: ModerationTable;
  kind: string; // explicit human label: Persona / Solicitud de ayuda / Oferta de ayuda
  id: string;
  label: string;
  sub: string | null; // category/urgency/etc
  detail: string | null; // free text (message/description)
  status: string | null;
  source: string | null; // null = enviado desde el sitio; otherwise external source
  hidden: boolean;
  created_at: string;
  photo_url?: string | null;
}

// Recent community submissions across the three tables for spam/false-report
// moderation. Includes hidden rows so admins can un-hide. Pulls enough fields to
// judge each item without opening it.
export async function listModerationItems(): Promise<ModerationItem[]> {
  const svc = getServerSupabase();
  const [checkins, requests, offers] = await Promise.all([
    svc.from("checkins").select("id,name,status,city,message,source,hidden,created_at,photo_url").order("created_at", { ascending: false }).limit(60),
    svc.from("help_requests").select("id,category,urgency,place_name,description,city,source,hidden,created_at").order("created_at", { ascending: false }).limit(60),
    svc.from("help_offers").select("id,category,description,city,source,hidden,created_at").order("created_at", { ascending: false }).limit(60),
  ]);
  const items: ModerationItem[] = [];
  for (const c of checkins.data ?? [])
    items.push({
      table: "checkins", kind: "Persona", id: c.id, label: c.name,
      sub: [c.status, c.city].filter(Boolean).join(" · ") || null,
      detail: c.message ?? null, status: c.status, source: c.source ?? null,
      hidden: c.hidden, created_at: c.created_at,
      photo_url: c.photo_url ?? null,
    });
  for (const r of requests.data ?? [])
    items.push({
      table: "help_requests", kind: "Solicitud de ayuda", id: r.id,
      label: r.place_name || r.category,
      sub: [r.category, r.urgency, r.city].filter(Boolean).join(" · ") || null,
      detail: r.description ?? null, status: r.urgency ?? null, source: r.source ?? null,
      hidden: r.hidden, created_at: r.created_at,
    });
  for (const o of offers.data ?? [])
    items.push({
      table: "help_offers", kind: "Oferta de ayuda", id: o.id, label: o.category,
      sub: o.city ?? null, detail: o.description ?? null, status: null,
      source: o.source ?? null, hidden: o.hidden, created_at: o.created_at,
    });
  return items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

// --- Colaboradores (API partners) -------------------------------------------
export interface PartnerRow {
  id: string;
  name: string;
  source: string;
  key_prefix: string | null;
  scopes: string[];
  contact: string | null;
  active: boolean;
  created_at: string;
  revoked_at: string | null;
}

// Lista de colaboradores para el admin. NUNCA devuelve key_hash ni la key.
export async function listPartners(): Promise<PartnerRow[]> {
  const svc = getServerSupabase();
  const { data } = await svc
    .from("api_partners")
    .select("id,name,source,key_prefix,scopes,contact,active,created_at,revoked_at")
    .order("created_at", { ascending: true });
  return (data ?? []) as PartnerRow[];
}

export interface AdminCenterRow {
  id: string;
  name: string;
  country: string;
  state: string | null;
  city: string | null;
  address: string | null;
  resources: string | null;
  organizers: string | null;
  contact: string | null;
  website: string | null;
  can_ship_to_venezuela: boolean | null;
  volunteers_count: number | null;
  needs_volunteers: boolean | null;
  needs: string[];
  verified: boolean;
  hidden: boolean;
  source: string;
  created_at: string;
}

export async function listCollectionCentersAdmin(): Promise<AdminCenterRow[]> {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "development") return devCollectionCenters();
    return [];
  }
  const svc = getServerSupabase();
  const { data } = await svc
    .from("collection_centers")
    .select("id,name,country,state,city,address,resources,organizers,contact,website,can_ship_to_venezuela,volunteers_count,needs_volunteers,needs,verified,hidden,source,created_at")
    .order("verified", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(300);
  return (data ?? []) as AdminCenterRow[];
}


export interface MergeSide {
  id: string;
  name: string;
  city: string | null;
  place_name: string | null;
  message: string | null;
  photo_url: string | null;
  has_phone: boolean;
  source: string | null;
  source_url: string | null;
  created_at: string;
}

export interface MergeCandidate {
  id: string;
  tier: "HARD" | "STRONG" | "REVIEW";
  confidence: number;
  reason: string;
  evidence: Record<string, unknown> | null;
  keep: MergeSide;
  dup: MergeSide;
}

export interface ReviewedCandidate extends MergeCandidate {
  status: string;
  decision: string;
  decided_by: string | null;
  decided_at: string | null;
}

// --- Dev mock data ---

const DEV_NAMES_F = ["María Pérez", "Ana López", "Marta Rivas", "Carmen Elena Martínez", "Sofía Alejandra Castro", "Valentina Isabel Rojas", "Gabriela del Carmen Mora", "Laura Patricia Sánchez", "Daniela Alexandra Paredes", "Yolanda Patricia Contreras"];
const DEV_NAMES_M = ["Juan Rodríguez", "Carlos Mendoza", "Pedro Sánchez", "José Gregorio Hernández", "Luis Alberto Martínez", "Miguel Ángel Silva", "Diego Alejandro Rodríguez", "Jesús Enrique Salazar", "Gustavo Adolfo Torres", "Andrés Eduardo Contreras"];
const DEV_CITIES = ["Caracas", "La Guaira", "Barquisimeto", "Valencia", "Maracaibo", "Los Teques", "Maracay", "San Felipe", "Puerto Cabello", "Turmero"];

function make(id: string, name: string, opts: Partial<MergeSide> = {}): MergeSide {
  const city = DEV_CITIES[Math.floor(Math.random() * DEV_CITIES.length)];
  return {
    id, name, city, place_name: null, message: null,
    photo_url: null, has_phone: false, source: null, source_url: null, created_at: new Date().toISOString(),
    ...opts,
  };
}

function devMergeCandidates(): MergeCandidate[] {
  const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
  return [
    {
      id: "mock-1", tier: "HARD", confidence: 0.97, reason: "Mismo nombre exacto + misma zona",
      evidence: { cosine: 0.92, phone_match: true },
      keep: make("a1", DEV_NAMES_F[0], { city: "Caracas", photo_url: "https://placehold.co/400x500/1a1a2e/eee?text=María", has_phone: true, source: "venezuela-ayuda.com", message: "Busco a mi hija", created_at: ago(10) }),
      dup: make("b1", "Maria Perez", { city: "Caracas", photo_url: "https://placehold.co/400x500/16213e/eee?text=Maria", source: "desaparecidosterremotovenezuela.com", message: "Reporto a María P.", created_at: ago(8) }),
    },
    {
      id: "mock-2", tier: "HARD", confidence: 0.95, reason: "Nombre idéntico + mismo teléfono",
      evidence: { cosine: 0.93, phone_match: true },
      keep: make("a2", DEV_NAMES_M[0], { city: "La Guaira", place_name: "Urbanización Caribe", has_phone: true, source: "venezuela-ayuda.com", created_at: ago(5) }),
      dup: make("b2", "Juan Rodríguez", { city: "La Guaira", place_name: "Caribe Sur", has_phone: true, source: "terremotovenezuela2026.vercel.app", created_at: ago(3) }),
    },
    {
      id: "mock-3", tier: "STRONG", confidence: 0.86, reason: "Nombre similar + misma ciudad",
      evidence: { cosine: 0.78 },
      keep: make("a3", DEV_NAMES_M[1], { city: "Barquisimeto", photo_url: "https://placehold.co/400x500/0f3460/eee?text=Carlos", source: "venezuela-ayuda.com", created_at: ago(7) }),
      dup: make("b3", "Carlos Mendo", { city: "Barquisimeto", photo_url: "https://placehold.co/400x500/533483/eee?text=C.M.", source: "venezuelatebusca.com", created_at: ago(5) }),
    },
    {
      id: "mock-4", tier: "STRONG", confidence: 0.82, reason: "Mismo nombre + foto similar",
      evidence: { cosine: 0.75, same_photo: true },
      keep: make("a4", DEV_NAMES_F[1], { city: "Valencia", photo_url: "https://placehold.co/400x500/1a1a2e/eee?text=Ana", has_phone: true, source: "venezuela-ayuda.com", created_at: ago(12) }),
      dup: make("b4", "Ana Lópes", { city: "Valencia", photo_url: "https://placehold.co/400x500/16213e/eee?text=Ana+L", source: "terremotovenezuela.com", created_at: ago(9) }),
    },
    {
      id: "mock-5", tier: "STRONG", confidence: 0.79, reason: "Apellido similar + misma zona geográfica",
      evidence: { cosine: 0.71, geo_proximity: true },
      keep: make("a5", DEV_NAMES_M[2], { city: "Maracaibo", source: "venezuela-ayuda.com", message: "Reporto desaparición de mi hermano", created_at: ago(4) }),
      dup: make("b5", "Pedro Sanches", { city: "Maracaibo", source: "terremotovenezuela.app", created_at: ago(2) }),
    },
    {
      id: "mock-6", tier: "REVIEW", confidence: 0.65, reason: "Posible duplicado, nombres parecidos",
      evidence: { cosine: 0.58 },
      keep: make("a6", DEV_NAMES_F[2], { city: "Los Teques", photo_url: "https://placehold.co/400x500/16213e/eee?text=Marta", has_phone: true, source: "venezuela-ayuda.com", created_at: ago(6) }),
      dup: make("b6", "Marta R.", { city: "Los Teques", source: "terremotove.netlify.app", message: "La vi en Los Teques", created_at: ago(4) }),
    },
    {
      id: "mock-7", tier: "REVIEW", confidence: 0.6, reason: "Apellido similar, misma fuente",
      evidence: { cosine: 0.52 },
      keep: make("a7", DEV_NAMES_F[3], { city: "Maracay", place_name: "Residencias Parque del Este", source: "venezuela-ayuda.com", created_at: ago(9) }),
      dup: make("b7", DEV_NAMES_F[3], { city: "Maracay", place_name: "Urb. El Bosque", source: "venezuela-ayuda.com", message: "Apareció mi familiar", created_at: ago(7) }),
    },
    {
      id: "mock-8", tier: "REVIEW", confidence: 0.55, reason: "Nombre dudoso, revisar manualmente",
      evidence: { cosine: 0.48 },
      keep: make("a8", DEV_NAMES_M[3], { city: "San Felipe", source: "venezuela-ayuda.com", created_at: ago(14) }),
      dup: make("b8", "José Hernández", { city: "San Felipe", source: "terremotovenezuela2026.vercel.app", created_at: ago(11) }),
    },
    // A chain of THREE pairs sharing records (r1–r2, r2–r3, r3–r4) → the same
    // person reported FOUR times. The UI groups these into one block.
    {
      id: "mock-9", tier: "HARD", confidence: 0.94, reason: "Mismo nombre + misma zona",
      evidence: { cosine: 0.9, phone_match: true },
      keep: make("r1", "Rosa Díaz", { city: "Caracas", place_name: "Petare", photo_url: "https://placehold.co/400x500/1a1a2e/eee?text=Rosa", has_phone: true, source: "venezuela-ayuda.com", message: "Busco a mi mamá", created_at: ago(9) }),
      dup: make("r2", "Rosa Diaz", { city: "Caracas", place_name: "Petare Sur", photo_url: "https://placehold.co/400x500/16213e/eee?text=Rosa+D", source: "desaparecidosterremotovenezuela.com", created_at: ago(7) }),
    },
    {
      id: "mock-10", tier: "STRONG", confidence: 0.85, reason: "Nombre similar + misma ciudad",
      evidence: { cosine: 0.8 },
      keep: make("r2", "Rosa Diaz", { city: "Caracas", place_name: "Petare Sur", photo_url: "https://placehold.co/400x500/16213e/eee?text=Rosa+D", source: "desaparecidosterremotovenezuela.com", created_at: ago(7) }),
      dup: make("r3", "Rosa M. Díaz", { city: "Caracas", place_name: "Petare", photo_url: "https://placehold.co/400x500/0f3460/eee?text=R.M.D", source: "venezuelatebusca.com", created_at: ago(5) }),
    },
    {
      id: "mock-11", tier: "REVIEW", confidence: 0.68, reason: "Apellido coincide, foto parecida",
      evidence: { cosine: 0.62 },
      keep: make("r3", "Rosa M. Díaz", { city: "Caracas", place_name: "Petare", photo_url: "https://placehold.co/400x500/0f3460/eee?text=R.M.D", source: "venezuelatebusca.com", created_at: ago(5) }),
      dup: make("r4", "R. Díaz", { city: "Caracas", place_name: "Petare Norte", source: "terremotove.netlify.app", message: "La vi en el refugio", created_at: ago(3) }),
    },
    {
      id: "mock-12", tier: "STRONG", confidence: 0.83, reason: "Mismo nombre + misma zona",
      evidence: { cosine: 0.77 },
      keep: make("r4", "R. Díaz", { city: "Caracas", place_name: "Petare Norte", source: "terremotove.netlify.app", created_at: ago(3) }),
      dup: make("r5", "Rosa Díaz G.", { city: "Caracas", place_name: "Petare", photo_url: "https://placehold.co/400x500/533483/eee?text=Rosa+G", has_phone: true, source: "venezuelatebusca.com", message: "Es mi vecina", created_at: ago(2) }),
    },
  ];
}

function devReviewedCandidates(): ReviewedCandidate[] {
  const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
  return [
    {
      id: "mock-reviewed-1", tier: "HARD", confidence: 0.95, reason: "Mismo nombre exacto",
      evidence: { cosine: 0.9, phone_match: true },
      keep: make("ra1", DEV_NAMES_M[4], { city: "Turmero", photo_url: "https://placehold.co/400x500/1a1a2e/eee?text=Luis", has_phone: true, source: "venezuela-ayuda.com", created_at: ago(20) }),
      dup: make("rb1", "Luis Alberto Martínez", { city: "Turmero", has_phone: true, source: "desaparecidosterremotovenezuela.com", created_at: ago(18) }),
      status: "MERGED", decision: "duplicate", decided_by: "dev@test.local", decided_at: ago(1),
    },
    {
      id: "mock-reviewed-2", tier: "STRONG", confidence: 0.88, reason: "Nombre similar + misma zona",
      evidence: { cosine: 0.81 },
      keep: make("ra2", DEV_NAMES_M[5], { city: "Puerto Cabello", photo_url: "https://placehold.co/400x500/0f3460/eee?text=Miguel", has_phone: true, source: "venezuela-ayuda.com", created_at: ago(15) }),
      dup: make("rb2", "Miguel Silva", { city: "Puerto Cabello", source: "terremotovenezuela2026.vercel.app", created_at: ago(13) }),
      status: "MERGED", decision: "consolidate", decided_by: "admin@test.local", decided_at: ago(3),
    },
    {
      id: "mock-reviewed-3", tier: "REVIEW", confidence: 0.59, reason: "Nombre dudoso",
      evidence: { cosine: 0.45 },
      keep: make("ra3", DEV_NAMES_F[4], { city: "Valencia", photo_url: "https://placehold.co/400x500/1a1a2e/eee?text=Sofía", source: "venezuela-ayuda.com", created_at: ago(25) }),
      dup: make("rb3", "Sofía Castro", { city: "Valencia", source: "venezuelatebusca.com", created_at: ago(22) }),
      status: "SKIPPED", decision: "skip", decided_by: null, decided_at: null,
    },
    {
      id: "mock-reviewed-4", tier: "HARD", confidence: 0.97, reason: "Registro duplicado exacto",
      evidence: { cosine: 0.96, phone_match: true },
      keep: make("ra4", DEV_NAMES_M[6], { city: "Caracas", place_name: "El Hatillo", has_phone: true, source: "venezuela-ayuda.com", created_at: ago(30) }),
      dup: make("rb4", "Diego Rodríguez", { city: "Caracas", place_name: "El Hatillo", has_phone: true, source: "terremotovenezuela.com", created_at: ago(28) }),
      status: "MERGED", decision: "duplicate", decided_by: "admin@test.local", decided_at: ago(2),
    },
    {
      id: "mock-reviewed-5", tier: "STRONG", confidence: 0.83, reason: "Mismo nombre + misma ciudad",
      evidence: { cosine: 0.79 },
      keep: make("ra5", DEV_NAMES_F[5], { city: "Maracay", photo_url: "https://placehold.co/400x500/16213e/eee?text=Valentina", source: "venezuela-ayuda.com", created_at: ago(11) }),
      dup: make("rb5", "Valentina Rojas", { city: "Maracay", source: "terremotovenezuela.app", created_at: ago(9) }),
      status: "MERGED", decision: "duplicate", decided_by: "admin@test.local", decided_at: ago(0.5),
    },
  ];
}

function devDamagedReports(): AdminDamagedRow[] {
  const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
  return [
    { id: "dm-1", place_name: "Residencias Don Carlos – Av. Bolívar", severity: "PARTIAL", city: "Caracas", description: "Grietas en columnas del estacionamiento. Riesgo moderado.", status: "OPEN", hidden: false, verified_at: null, created_at: ago(2) },
    { id: "dm-2", place_name: "Edificio Savoy – Plaza Miranda", severity: "COLLAPSE_RISK", city: "Caracas", description: "Estructura inclinada. Riesgo de colapso inminente. Desalojado.", status: "OPEN", hidden: false, verified_at: ago(1), created_at: ago(5) },
    { id: "dm-3", place_name: "Urbanización Los Sauces – Av. Principal", severity: "CRACKS", city: "Maracay", description: "Grietas superficiales en fachada. Sin riesgo estructural.", status: "OPEN", hidden: false, verified_at: null, created_at: ago(3) },
    { id: "dm-4", place_name: "Conjunto Residencial Las Ánimas", severity: "COLLAPSED", city: "Valencia", description: "Edificio colapsado totalmente. Escombros removidos. 3 heridos.", status: "RESOLVED", hidden: false, verified_at: ago(10), created_at: ago(15) },
    { id: "dm-5", place_name: "Barrio Unión – Sector La Cruz", severity: "PARTIAL", city: "Barquisimeto", description: "Vivienda con daños en techo y paredes laterales.", status: "IN_PROGRESS", hidden: false, verified_at: ago(7), created_at: ago(8) },
    { id: "dm-6", place_name: "Bloque 4 – 23 de Enero", severity: "COLLAPSE_RISK", city: "Caracas", description: "Losas superiores comprometidas. Evaluación urgente.", status: "OPEN", hidden: true, verified_at: null, created_at: ago(1) },
    { id: "dm-7", place_name: "Edificio Torreón – Calle Sucre", severity: "CRACKS", city: "La Guaira", description: "Grietas finas en paredes interiores.", status: "OPEN", hidden: false, verified_at: null, created_at: ago(4) },
    { id: "dm-8", place_name: "Residencias Río Chico – Calle 5", severity: "PARTIAL", city: "Los Teques", description: "Muro perimetral colapsado. Riesgo bajo.", status: "OPEN", hidden: false, verified_at: ago(2), created_at: ago(6) },
  ];
}

function devCollectionCenters(): AdminCenterRow[] {
  const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
  return [
    {
      id: "dc-1", name: "Centro de acopio · Barinas", country: "Venezuela", state: "Barinas", city: "Barinas",
      address: "Av. Marqués del Pumar, diagonal al Hotel Comercio, Casa Azul. Barinas. 8:00am–6:00pm · Contacto 0412 569.33.30",
      resources: "agua potable, alimentos no perecederos, insumos médicos, ropa y abrigos.",
      organizers: null, contact: "0412 569.33.30", website: null,
      can_ship_to_venezuela: null, volunteers_count: null, needs_volunteers: false, needs: ["centro-de-acopio"],
      verified: true, hidden: false, source: "seed", created_at: ago(0.12),
    },
    {
      id: "dc-2", name: "Centro de acopio Bogotá", country: "Colombia", state: null, city: "Bogotá",
      address: "Calle 104 #54-31, Barrio Pasadena, en Suba.",
      resources: null, organizers: null, contact: null, website: null,
      can_ship_to_venezuela: null, volunteers_count: null, needs_volunteers: false, needs: ["centro-de-acopio"],
      verified: true, hidden: false, source: "seed", created_at: ago(0.12),
    },
    {
      id: "dc-3", name: "Centro de acopio Santa Marta", country: "Colombia", state: null, city: "Santa Marta",
      address: "Parque La Tenería, Carrera 2 con 1D36, cerca de Playa Los Cocos.",
      resources: null, organizers: null, contact: null, website: null,
      can_ship_to_venezuela: null, volunteers_count: null, needs_volunteers: false, needs: ["centro-de-acopio"],
      verified: true, hidden: false, source: "seed", created_at: ago(0.12),
    },
    {
      id: "dc-4", name: "Centro de acopio Bucaramanga", country: "Colombia", state: null, city: "Bucaramanga",
      address: "Calle 18 #21-52 San Francisco, Bucaramanga Santander, diagonal a la Iglesia San Francisco.",
      resources: null, organizers: null, contact: null, website: null,
      can_ship_to_venezuela: null, volunteers_count: null, needs_volunteers: false, needs: ["centro-de-acopio"],
      verified: true, hidden: false, source: "seed", created_at: ago(0.12),
    },
    {
      id: "dc-5", name: "Centro de acopio Cali", country: "Colombia", state: null, city: "Cali",
      address: "Carrera 28 B3 #72S-32 Comuneros II (cerca Troncal Unida).",
      resources: null, organizers: null, contact: null, website: null,
      can_ship_to_venezuela: null, volunteers_count: null, needs_volunteers: false, needs: ["centro-de-acopio"],
      verified: true, hidden: false, source: "seed", created_at: ago(0.12),
    },
    {
      id: "dc-6", name: "Centro de acopio · Miranda", country: "Venezuela", state: "Miranda", city: "Altamira",
      address: "4ta avenida de Altamira, entre 9na y 10ma transversal; quinta El Bejucal.",
      resources: "agua potable, alimentos no perecederos, insumos médicos, ropa y abrigos.",
      organizers: null, contact: null, website: null,
      can_ship_to_venezuela: null, volunteers_count: null, needs_volunteers: false, needs: ["centro-de-acopio"],
      verified: true, hidden: false, source: "seed", created_at: ago(0.12),
    },
    {
      id: "dc-7", name: "Centro de acopio · Aragua", country: "Venezuela", state: "Aragua", city: "Maracay",
      address: "Av. 19 de Abril, C.C. La Capilla, piso 1, local 21. Maracay.",
      resources: "agua potable, alimentos no perecederos, insumos médicos, ropa y abrigos.",
      organizers: null, contact: null, website: null,
      can_ship_to_venezuela: null, volunteers_count: null, needs_volunteers: false, needs: ["centro-de-acopio"],
      verified: true, hidden: false, source: "seed", created_at: ago(0.12),
    },
    {
      id: "dc-8", name: "Centro de acopio · Carabobo", country: "Venezuela", state: "Carabobo", city: "Valencia",
      address: "Av. Monseñor Adams, El Viñedo. Edificio Talislandia, mezzanina. Valencia.",
      resources: "agua potable, alimentos no perecederos, insumos médicos, ropa y abrigos.",
      organizers: null, contact: null, website: null,
      can_ship_to_venezuela: null, volunteers_count: null, needs_volunteers: false, needs: ["centro-de-acopio"],
      verified: true, hidden: false, source: "seed", created_at: ago(0.12),
    },
    {
      id: "dc-9", name: "Mister Pepito", country: "Brasil", state: "Roraima", city: "Boa Vista",
      address: "Avenida Venezuela, 1390 - Mecejana (Frente ao Supermecado Goiana)",
      resources: "Agua potable, Alimentos não perecederos (enlatados que no exigen cocimiento), Kits de primeros socorros (gazas, vendas, antisépticos), Artículos de higiene personal (papel higiénico, jabón, cepillo de dientes), Cobertores y sábanas limpias",
      organizers: "Mister Pepito", contact: null, website: null,
      can_ship_to_venezuela: true, volunteers_count: null, needs_volunteers: false, needs: ["centro-de-acopio"],
      verified: false, hidden: false, source: "user", created_at: ago(0.04),
    },
    {
      id: "dc-10", name: "Restaurante La Pozoleria", country: "México", state: "Chihuahua", city: "Chihuahua",
      address: "Medicina #911",
      resources: "Agua, alimentos no perecederos, insumos medicos básicos para curaciones, Insumos médicos: analgésicos y antipiréticos (paracetamol, ibuprofeno), antisépticos, material de curación (gasas, vendas, apósitos, algodón), suero salino, cremas antibióticas, sales de rehidratación, antidiarreicos, guantes, cubrebocas, gel antibacterial y termómetros",
      organizers: "Luis Angel Alvarado", contact: "lapozoleria.cuu@hotmail.com", website: null,
      can_ship_to_venezuela: null, volunteers_count: 5, needs_volunteers: false, needs: ["centro-de-acopio"],
      verified: false, hidden: false, source: "user", created_at: ago(0.08),
    },
    {
      id: "dc-11", name: "Comunidad de Venezolanos en Espírito Santo", country: "Brasil", state: "Espírito Santo", city: "Vila Velha",
      address: "Indefinido",
      resources: "Alimentos no perecederos, ropas, mantas, productos de higiene personal",
      organizers: "Gabriela Reina y More Fernandez", contact: "+552799816-5560 / +5527997211829", website: null,
      can_ship_to_venezuela: null, volunteers_count: 10, needs_volunteers: false, needs: ["centro-de-acopio"],
      verified: false, hidden: false, source: "user", created_at: ago(0.08),
    },
  ];
}

function devModerationItems(): ModerationItem[] {
  const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
  return [
    { table: "checkins", id: "mod-1", label: "María Pérez", sub: "LOOKING_FOR_SOMEONE · Caracas", hidden: false, created_at: ago(1) },
    { table: "checkins", id: "mod-2", label: "Juan Rodríguez", sub: "LOOKING_FOR_SOMEONE · La Guaira", hidden: false, created_at: ago(2) },
    { table: "help_requests", id: "mod-3", label: "Residencias Parque del Este", sub: "shelter · Maracay", hidden: false, created_at: ago(3) },
    { table: "help_offers", id: "mod-4", label: "transportation", sub: "Valencia", hidden: false, created_at: ago(4) },
    { table: "checkins", id: "mod-5", label: "Carlos Mendoza", sub: "LOOKING_FOR_SOMEONE · Barquisimeto", hidden: true, created_at: ago(5) },
    { table: "help_requests", id: "mod-6", label: "Edificio Savoy", sub: "medical · Caracas", hidden: false, created_at: ago(6) },
    { table: "help_offers", id: "mod-7", label: "food", sub: "Maracaibo", hidden: false, created_at: ago(7) },
    { table: "checkins", id: "mod-8", label: "Ana López", sub: "LOOKING_FOR_SOMEONE · Valencia", hidden: false, created_at: ago(8) },
  ];
}

// --- List merge candidates (pending) ---

export async function listMergeCandidates(limit = 50, adminEmail?: string): Promise<MergeCandidate[]> {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "development") return devMergeCandidates();
    return [];
  }
  if (!adminEmail) return [];
  const svc = getServerSupabase();
  const timeout = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: existing } = await svc
    .from("merge_candidates")
    .select("id")
    .eq("assigned_to", adminEmail)
    .eq("status", "PENDING");
  const needed = Math.max(0, limit - (existing?.length ?? 0));

  if (needed > 0) {
    const { data: fresh } = await svc
      .from("merge_candidates")
      .select("id")
      .eq("status", "PENDING")
      .eq("table_name", "checkins")
      .or(`assigned_to.is.null,assigned_at.lt.${timeout}`)
      .order("confidence", { ascending: false })
      .limit(needed);
    if (fresh?.length) {
      await svc
        .from("merge_candidates")
        .update({ assigned_to: adminEmail, assigned_at: new Date().toISOString() })
        .in("id", fresh.map((c) => c.id));
    }
  }

  const { data: cands, error: candErr } = await svc
    .from("merge_candidates")
    .select("id,tier,confidence,reason,evidence,keep_id,dup_id")
    .eq("assigned_to", adminEmail)
    .eq("status", "PENDING")
    .eq("table_name", "checkins")
    .order("confidence", { ascending: false });
  if (candErr || !cands?.length) return [];

  const ids = Array.from(new Set(cands.flatMap((c) => [c.keep_id, c.dup_id])));
  const { data: rows } = await svc
    .from("checkins")
    .select("id,name,city,place_name,message,photo_url,phone_private,source,source_url,created_at")
    .in("id", ids);
  const byId = new Map<string, MergeSide>();
  for (const r of rows ?? [])
    byId.set(r.id, {
      id: r.id, name: r.name, city: r.city ?? null, place_name: r.place_name ?? null,
      message: r.message ?? null, photo_url: r.photo_url ?? null,
      has_phone: Boolean(r.phone_private), source: r.source ?? null, source_url: r.source_url ?? null, created_at: r.created_at,
    });

  const tierRank: Record<string, number> = { HARD: 0, STRONG: 1, REVIEW: 2 };
  return cands
    .map((c) => ({
      id: c.id, tier: c.tier as MergeCandidate["tier"], confidence: c.confidence,
      reason: c.reason, evidence: c.evidence ?? null,
      keep: byId.get(c.keep_id)!, dup: byId.get(c.dup_id)!,
    }))
    .filter((c) => c.keep && c.dup)
    .sort((a, b) => tierRank[a.tier] - tierRank[b.tier] || b.confidence - a.confidence);
}

export async function releaseMyAssignments(adminEmail: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const svc = getServerSupabase();
  await svc
    .from("merge_candidates")
    .update({ assigned_to: null, assigned_at: null })
    .eq("assigned_to", adminEmail)
    .eq("status", "PENDING");
}

// --- List reviewed candidates ---

export async function listReviewedCandidates(limit = 100): Promise<ReviewedCandidate[]> {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "development") return devReviewedCandidates();
    return [];
  }
  const svc = getServerSupabase();
  const { data: cands, error: candErr } = await svc
    .from("merge_candidates")
    .select("id,tier,confidence,reason,evidence,keep_id,dup_id,status,decided_by,decided_at")
    .neq("status", "PENDING")
    .order("decided_at", { ascending: false })
    .limit(limit);
  if (candErr || !cands?.length) return [];

  const ids = Array.from(new Set(cands.flatMap((c) => [c.keep_id, c.dup_id])));
  const { data: rows } = await svc
    .from("checkins")
    .select("id,name,city,place_name,message,photo_url,phone_private,source,source_url,created_at")
    .in("id", ids);
  const byId = new Map<string, MergeSide>();
  for (const r of rows ?? [])
    byId.set(r.id, {
      id: r.id, name: r.name, city: r.city ?? null, place_name: r.place_name ?? null,
      message: r.message ?? null, photo_url: r.photo_url ?? null,
      has_phone: Boolean(r.phone_private), source: r.source ?? null, source_url: r.source_url ?? null, created_at: r.created_at,
    });

  return cands
    .map((c) => ({
      id: c.id, tier: c.tier as MergeCandidate["tier"], confidence: c.confidence,
      reason: c.reason, evidence: c.evidence ?? null,
      keep: byId.get(c.keep_id)!, dup: byId.get(c.dup_id)!,
      status: c.status, decision: c.status === "MERGED" ? "duplicate" : "skip",
      decided_by: c.decided_by, decided_at: c.decided_at,
    }))
    .filter((c) => c.keep && c.dup);
}

// --- Reopen a previously decided candidate ---

export async function reopenMergeCandidate(candidateId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const svc = getServerSupabase();
  const { data: cand } = await svc
    .from("merge_candidates")
    .select("id,keep_id,dup_id")
    .eq("id", candidateId)
    .maybeSingle();
  if (!cand) return;

  await svc
    .from("checkins")
    .update({ hidden: false })
    .in("id", [cand.keep_id, cand.dup_id]);

  await svc
    .from("merge_candidates")
    .update({ status: "PENDING", decided_by: null, decided_at: null, assigned_to: null, assigned_at: null })
    .eq("id", candidateId);
}

// --- Notifications ---

export async function createNotification(
  checkinId: string,
  type: "safe" | "found" | "merged" | "consolidated",
  message: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const svc = getServerSupabase();
  const { data } = await svc
    .from("checkins")
    .select("manage_token")
    .eq("id", checkinId)
    .maybeSingle();
  if (!data?.manage_token) return;
  await svc.from("admin_notifications").insert({
    checkin_id: checkinId,
    manage_token: data.manage_token,
    type,
    message,
  });
}

export async function listNotifications(manageToken: string): Promise<
  { id: string; type: string; message: string; read: boolean; created_at: string }[]
> {
  if (!isSupabaseConfigured() || !manageToken) return [];
  const svc = getServerSupabase();
  const { data } = await svc
    .from("admin_notifications")
    .select("id,type,message,read,created_at")
    .eq("manage_token", manageToken)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as any;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const svc = getServerSupabase();
  await svc.from("admin_notifications").update({ read: true }).eq("id", notificationId);
}

// --- Moderation ---

export async function listModerationItems(): Promise<ModerationItem[]> {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "development") return devModerationItems();
    return [];
  }
  const svc = getServerSupabase();
  const [checkins, requests, offers] = await Promise.all([
    svc.from("checkins").select("id,name,status,city,hidden,created_at,photo_url").order("created_at", { ascending: false }).limit(40),
    svc.from("help_requests").select("id,category,place_name,city,hidden,created_at").order("created_at", { ascending: false }).limit(40),
    svc.from("help_offers").select("id,category,city,hidden,created_at").order("created_at", { ascending: false }).limit(40),
  ]);
  const items: ModerationItem[] = [];
  for (const c of checkins.data ?? [])
    items.push({ table: "checkins", id: c.id, label: c.name, sub: `${c.status} · ${c.city ?? ""}`, hidden: c.hidden, created_at: c.created_at, photo_url: c.photo_url ?? null });
  for (const r of requests.data ?? [])
    items.push({ table: "help_requests", id: r.id, label: r.place_name || r.category, sub: `${r.category} · ${r.city ?? ""}`, hidden: r.hidden, created_at: r.created_at });
  for (const o of offers.data ?? [])
    items.push({ table: "help_offers", id: o.id, label: o.category, sub: o.city ?? null, hidden: o.hidden, created_at: o.created_at });
  return items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export interface PartnerRow {
  id: string;
  name: string;
  source: string;
  key_prefix: string;
  active: boolean;
  contact: string | null;
  created_at: string;
  revoked_at: string | null;
}

export async function listPartners(): Promise<PartnerRow[]> {
  const svc = getServerSupabase();
  const { data } = await svc
    .from("api_partners")
    .select("*")
    .order("created_at", { ascending: true });
  return (data ?? []) as PartnerRow[];
}

export interface HospitalizedRow {
  id: string;
  nombre: string;
  apellido: string;
  ci: string;
  edad: string;
  hospital: string;
  status: string;
  fuentes: string;
  notas: string;
  created_at: string;
}

export async function listHospitalizedAdmin(): Promise<HospitalizedRow[]> {
  const svc = getServerSupabase();
  const { data } = await svc
    .from("hospitalized")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(2000);
  return (data ?? []) as HospitalizedRow[];
}
