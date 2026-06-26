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

// --- Dedup review queue (merge_candidates) -----------------------------------
// One checkin as shown side-by-side in the duplicate review UI.
export interface MergeSide {
  id: string;
  name: string;
  city: string | null;
  place_name: string | null;
  message: string | null;
  photo_url: string | null;
  has_phone: boolean;
  source: string | null;
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

// Pending duplicate pairs for human review, highest tier + confidence first.
// Fetches both checkins of each pair so the UI can show them side by side.
// phone_private is reduced to a boolean (never expose the number in the UI).
export async function listMergeCandidates(limit = 50): Promise<MergeCandidate[]> {
  const svc = getServerSupabase();
  const { data: cands, error: candErr } = await svc
    .from("merge_candidates")
    .select("id,tier,confidence,reason,evidence,keep_id,dup_id")
    .eq("status", "PENDING")
    .eq("table_name", "checkins")
    .order("confidence", { ascending: false })
    .limit(limit);
  if (candErr || !cands?.length) return [];

  // Fetch every referenced checkin in one query.
  const ids = Array.from(new Set(cands.flatMap((c) => [c.keep_id, c.dup_id])));
  const { data: rows } = await svc
    .from("checkins")
    .select("id,name,city,place_name,message,photo_url,phone_private,source,created_at")
    .in("id", ids);
  const byId = new Map<string, MergeSide>();
  for (const r of rows ?? [])
    byId.set(r.id, {
      id: r.id,
      name: r.name,
      city: r.city ?? null,
      place_name: r.place_name ?? null,
      message: r.message ?? null,
      photo_url: r.photo_url ?? null,
      has_phone: Boolean(r.phone_private),
      source: r.source ?? null,
      created_at: r.created_at,
    });

  const tierRank: Record<string, number> = { HARD: 0, STRONG: 1, REVIEW: 2 };
  return cands
    .map((c) => ({
      id: c.id,
      tier: c.tier as MergeCandidate["tier"],
      confidence: c.confidence,
      reason: c.reason,
      evidence: c.evidence ?? null,
      keep: byId.get(c.keep_id)!,
      dup: byId.get(c.dup_id)!,
    }))
    .filter((c) => c.keep && c.dup)
    .sort((a, b) => tierRank[a.tier] - tierRank[b.tier] || b.confidence - a.confidence);
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
