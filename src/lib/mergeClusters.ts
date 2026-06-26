import type { MergeCandidate, MergeSide } from "@/lib/admin";

// The dedup engine emits PAIRS (A↔B). But the same person can be reported 3-4
// times, surfacing as a chain of pairs (A↔B, B↔C, C↔D). This groups the pairs
// into connected components so the reviewer sees the whole "block" of one person
// at once — purely on the read side, without changing how a pair is decided.

export interface MergeClusterGroupData {
  id: string; // smallest member id — stable React key
  members: MergeSide[];
  pairs: MergeCandidate[];
  tier: MergeCandidate["tier"];
  confidence: number;
}

const RANK: Record<MergeCandidate["tier"], number> = { HARD: 0, STRONG: 1, REVIEW: 2 };

export function buildClusters(candidates: MergeCandidate[]): {
  clusters: MergeClusterGroupData[];
  singles: MergeCandidate[];
} {
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
  const ensure = (x: string) => {
    if (!parent.has(x)) parent.set(x, x);
  };
  const union = (a: string, b: string) => {
    ensure(a);
    ensure(b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const c of candidates) union(c.keep.id, c.dup.id);

  const byRoot = new Map<string, MergeCandidate[]>();
  for (const c of candidates) {
    const root = find(c.keep.id);
    (byRoot.get(root) ?? byRoot.set(root, []).get(root)!).push(c);
  }

  const clusters: MergeClusterGroupData[] = [];
  const singles: MergeCandidate[] = [];

  for (const pairs of byRoot.values()) {
    const byId = new Map<string, MergeSide>();
    for (const p of pairs) {
      if (!byId.has(p.keep.id)) byId.set(p.keep.id, p.keep);
      if (!byId.has(p.dup.id)) byId.set(p.dup.id, p.dup);
    }
    const members = Array.from(byId.values());
    if (members.length >= 3) {
      const tier = pairs.reduce<MergeCandidate["tier"]>(
        (best, p) => (RANK[p.tier] < RANK[best] ? p.tier : best),
        "REVIEW",
      );
      const confidence = pairs.reduce((m, p) => Math.max(m, p.confidence), 0);
      clusters.push({ id: Array.from(byId.keys()).sort()[0], members, pairs, tier, confidence });
    } else {
      singles.push(pairs[0]);
    }
  }

  clusters.sort((a, b) => RANK[a.tier] - RANK[b.tier] || b.confidence - a.confidence);
  singles.sort((a, b) => RANK[a.tier] - RANK[b.tier] || b.confidence - a.confidence);
  return { clusters, singles };
}
