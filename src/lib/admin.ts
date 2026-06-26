import "server-only";
import { getAuthClient } from "@/lib/supabase/auth";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";

// Returns the logged-in admin's email, or null if not authenticated OR not on
// the allowlist. The allowlist (admin_emails) is read with the service key.
export async function getAdminEmail(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const auth = await getAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  return (await isEmailAdmin(email)) ? email : null;
}

export async function isEmailAdmin(email: string): Promise<boolean> {
  const svc = getServerSupabase();
  const { data } = await svc
    .from("admin_emails")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return Boolean(data);
}

export interface AdminRow {
  email: string;
  added_by: string | null;
  created_at: string;
}

export async function listAdmins(): Promise<AdminRow[]> {
  const svc = getServerSupabase();
  const { data } = await svc
    .from("admin_emails")
    .select("*")
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
  created_at: string;
}

export async function listDamagedReportsAdmin(): Promise<AdminDamagedRow[]> {
  const svc = getServerSupabase();
  const { data } = await svc
    .from("damaged_reports")
    .select("id,place_name,severity,city,description,status,hidden,verified_at,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as AdminDamagedRow[];
}

export type ModerationTable = "checkins" | "help_requests" | "help_offers";

export interface ModerationItem {
  table: ModerationTable;
  id: string;
  label: string;
  sub: string | null;
  hidden: boolean;
  created_at: string;
}

// Recent community submissions across the three tables for spam/false-report
// moderation. Includes hidden rows so admins can un-hide.
export async function listModerationItems(): Promise<ModerationItem[]> {
  const svc = getServerSupabase();
  const [checkins, requests, offers] = await Promise.all([
    svc.from("checkins").select("id,name,status,city,hidden,created_at").order("created_at", { ascending: false }).limit(40),
    svc.from("help_requests").select("id,category,place_name,city,hidden,created_at").order("created_at", { ascending: false }).limit(40),
    svc.from("help_offers").select("id,category,city,hidden,created_at").order("created_at", { ascending: false }).limit(40),
  ]);
  const items: ModerationItem[] = [];
  for (const c of checkins.data ?? [])
    items.push({ table: "checkins", id: c.id, label: c.name, sub: `${c.status} · ${c.city ?? ""}`, hidden: c.hidden, created_at: c.created_at });
  for (const r of requests.data ?? [])
    items.push({ table: "help_requests", id: r.id, label: r.place_name || r.category, sub: `${r.category} · ${r.city ?? ""}`, hidden: r.hidden, created_at: r.created_at });
  for (const o of offers.data ?? [])
    items.push({ table: "help_offers", id: o.id, label: o.category, sub: o.city ?? null, hidden: o.hidden, created_at: o.created_at });
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
  source: string | null;
  created_at: string;
}

// All collection centers for moderation, PENDING (unverified) first.
export async function listCollectionCentersAdmin(): Promise<AdminCenterRow[]> {
  const svc = getServerSupabase();
  const { data } = await svc
    .from("collection_centers")
    .select(
      "id,name,country,state,city,address,resources,organizers,contact,website,can_ship_to_venezuela,volunteers_count,needs_volunteers,needs,verified,hidden,source,created_at",
    )
    .order("verified", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(300);
  return (data ?? []) as AdminCenterRow[];
}
