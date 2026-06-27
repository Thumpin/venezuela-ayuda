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
  has_cedula: boolean;
  source: string | null;
  created_at: string;
}

// Triage lane assigned by the dedup engine (0015): HARD = near-certain (same
// phone + compatible name), STRONG = score >= 0.90, REVIEW = merely plausible.
export type MergeTier = "HARD" | "STRONG" | "REVIEW";

// One edge of the dedup graph: a single pending candidate pair. The cluster
// builder keeps these so a per-block decision can map back to the real
// merge_candidates rows it resolves.
export interface MergePair {
  id: string;
  tier: MergeTier;
  confidence: number;
  evidence: Record<string, unknown> | null;
  keep_id: string;
  dup_id: string;
}

// A connected component of pending pairs: several checkins the engine has linked
// (directly or transitively) as possibly the same person. The UI reviews the
// whole block at once instead of one pair at a time.
export interface MergeCluster {
  // Stable id for the block (smallest member id) — used as a React key and to
  // namespace form state. Not a DB row.
  id: string;
  // Highest tier / confidence across the block's pairs (drives triage order).
  tier: MergeTier;
  confidence: number;
  // The member we suggest keeping (the richest row, by the same score the engine
  // uses): first preselected as KEEP in the UI.
  suggestedKeepId: string;
  members: MergeSide[];
  // The pending pairs that tie this block together. Resolving the block updates
  // exactly these rows.
  pairs: MergePair[];
}

const TIER_RANK: Record<string, number> = { HARD: 0, STRONG: 1, REVIEW: 2 };

// "Richness" of a checkin, matching the engine's keep-picking order: has photo >
// longer message > earlier created_at. Higher tuple = better canonical row.
function richness(s: MergeSide): [number, number, number] {
  return [s.photo_url ? 1 : 0, s.message?.length ?? 0, -new Date(s.created_at).getTime()];
}
function richer(a: MergeSide, b: MergeSide): boolean {
  const ra = richness(a);
  const rb = richness(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] > rb[i];
  }
  return a.id <= b.id;
}

// Which lane of the review queue to read. PENDING is the main queue; DEFERRED is
// the "no estoy seguro" lane set aside for a second look.
export type MergeQueue = "PENDING" | "DEFERRED";

// Duplicate pairs in a given lane, grouped into BLOCKS (connected components) for
// human review, highest tier + confidence first. Fetches every referenced
// checkin so the UI can show each block's members side by side. phone_private is
// reduced to a boolean (never expose the number in the UI).
//
// `limit` bounds the number of *pairs* pulled from the queue (cheap upper bound);
// the resulting blocks are however many components those pairs form.
export async function listMergeClusters(
  status: MergeQueue = "PENDING",
  limit = 200,
): Promise<MergeCluster[]> {
  const svc = getServerSupabase();
  const { data: cands, error: candErr } = await svc
    .from("merge_candidates")
    .select("id,tier,confidence,reason,evidence,keep_id,dup_id")
    .eq("status", status)
    .eq("table_name", "checkins")
    .order("confidence", { ascending: false })
    .limit(limit);
  if (candErr || !cands?.length) return [];

  // Fetch every referenced checkin in one query.
  const ids = Array.from(new Set(cands.flatMap((c) => [c.keep_id, c.dup_id])));
  const { data: rows } = await svc
    .from("checkins")
    .select("id,name,city,place_name,message,photo_url,phone_private,cedula_private,source,created_at")
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
      has_cedula: Boolean(r.cedula_private),
      source: r.source ?? null,
      created_at: r.created_at,
    });

  // Union-find over the pairs → connected components. A pair whose checkin rows
  // are missing (deleted) is dropped.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(x) !== root) {
      const next = parent.get(x)!;
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const ensure = (x: string) => {
    if (!parent.has(x)) parent.set(x, x);
  };

  const pairs: MergePair[] = [];
  for (const c of cands) {
    if (!byId.has(c.keep_id) || !byId.has(c.dup_id)) continue;
    ensure(c.keep_id);
    ensure(c.dup_id);
    union(c.keep_id, c.dup_id);
    pairs.push({
      id: c.id,
      tier: c.tier as MergeTier,
      confidence: c.confidence,
      evidence: c.evidence ?? null,
      keep_id: c.keep_id,
      dup_id: c.dup_id,
    });
  }

  // Bucket members and pairs by their component root.
  const memberIds = new Map<string, Set<string>>();
  for (const id of parent.keys()) {
    const root = find(id);
    (memberIds.get(root) ?? memberIds.set(root, new Set()).get(root)!).add(id);
  }
  const clusterPairs = new Map<string, MergePair[]>();
  for (const p of pairs) {
    const root = find(p.keep_id);
    (clusterPairs.get(root) ?? clusterPairs.set(root, []).get(root)!).push(p);
  }

  const clusters: MergeCluster[] = [];
  for (const [root, idSet] of memberIds) {
    const members = Array.from(idSet)
      .map((id) => byId.get(id)!)
      .filter(Boolean)
      .sort((a, b) => (richer(a, b) ? -1 : 1));
    const blockPairs = clusterPairs.get(root) ?? [];
    if (members.length < 2 || blockPairs.length === 0) continue;

    // Block-level tier/confidence = the strongest pair in it.
    const bestTier = blockPairs.reduce(
      (acc, p) => (TIER_RANK[p.tier] < TIER_RANK[acc] ? p.tier : acc),
      "REVIEW" as MergeTier,
    );
    const bestConf = blockPairs.reduce((acc, p) => Math.max(acc, p.confidence), 0);

    clusters.push({
      id: [...idSet].sort()[0],
      tier: bestTier,
      confidence: bestConf,
      suggestedKeepId: members[0].id, // already sorted richest-first
      members,
      pairs: blockPairs,
    });
  }

  return clusters.sort(
    (a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || b.confidence - a.confidence,
  );
}

// Number of candidate pairs currently set aside in the "dudosos" lane. Counts
// pairs, not blocks (cheap, exact enough for a "Ver dudosos (N)" badge).
export async function countDeferredCandidates(): Promise<number> {
  const svc = getServerSupabase();
  const { count } = await svc
    .from("merge_candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "DEFERRED")
    .eq("table_name", "checkins");
  return count ?? 0;
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
