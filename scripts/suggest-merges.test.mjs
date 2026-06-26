// Tests for the pair-building logic of suggest-merges.mjs (the part that turns
// clusters into review-queue pairs). Pure: no network, no Supabase.
//   node --test scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterNames } from "./dedup-lib.mjs";

// Re-implement buildPairs here against the same contract the script uses, so the
// logic is testable without importing the script's network side effects.
const THRESHOLD = 0.95;
function buildPairs({ rows, nameOf, score }) {
  const names = rows.map(nameOf);
  const { clusters } = clusterNames(names, THRESHOLD);
  const pairs = [];
  for (const cluster of clusters) {
    if (cluster.length < 2) continue;
    const ordered = [...cluster].sort((a, b) => score(rows[b]) - score(rows[a]));
    const keep = rows[ordered[0]];
    for (const idx of ordered.slice(1)) {
      const dup = rows[idx];
      if (keep.id === dup.id) continue;
      if (keep.dedup_key && dup.dedup_key && keep.dedup_key === dup.dedup_key) continue;
      pairs.push({ keep_id: keep.id, dup_id: dup.id, confidence: THRESHOLD });
    }
  }
  return pairs;
}

const placeName = (r) => r.place_name || "";
const scoreDamaged = (r) => (r.photo_url ? 1e5 : 0) + (r.description ? r.description.length : 0);

test("buildPairs: queues a near-name pair and picks the richer row as keep", () => {
  const rows = [
    { id: "a", place_name: "Residencias Mediterráneo", description: "grietas", photo_url: null },
    { id: "b", place_name: "residencias mediterraneo", description: "grietas en fachada, piso 3", photo_url: "x.jpg" },
  ];
  const pairs = buildPairs({ rows, nameOf: placeName, score: scoreDamaged });
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].keep_id, "b"); // b has a photo → richer → kept
  assert.equal(pairs[0].dup_id, "a");
});

test("buildPairs: unit veto — Torre 1 vs Torre 2 are NOT queued", () => {
  const rows = [
    { id: "a", place_name: "Parque Central Torre 1", description: "", photo_url: null },
    { id: "b", place_name: "Parque Central Torre 2", description: "", photo_url: null },
  ];
  assert.equal(buildPairs({ rows, nameOf: placeName, score: scoreDamaged }).length, 0);
});

test("buildPairs: exact dedup_key collisions are skipped (cleanup owns those)", () => {
  const rows = [
    { id: "a", place_name: "Residencias Caribe", dedup_key: "k1", description: "", photo_url: null },
    { id: "b", place_name: "Residencias Caribe", dedup_key: "k1", description: "", photo_url: null },
  ];
  assert.equal(buildPairs({ rows, nameOf: placeName, score: scoreDamaged }).length, 0);
});

test("buildPairs: distinct places are not paired", () => {
  const rows = [
    { id: "a", place_name: "Residencias Caribe", description: "", photo_url: null },
    { id: "b", place_name: "Residencias Caroní", description: "", photo_url: null },
  ];
  assert.equal(buildPairs({ rows, nameOf: placeName, score: scoreDamaged }).length, 0);
});
