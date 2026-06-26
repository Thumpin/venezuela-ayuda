// Fuzzy dedup as a REVIEW QUEUE — proposes near-duplicate pairs, never deletes.
//
//   node scripts/suggest-merges.mjs --dry   # find pairs, print, write nothing
//   node scripts/suggest-merges.mjs         # upsert PENDING rows to merge_candidates
//
// Runs clusterNames (Jaro-Winkler >= 0.95 with unit veto) over checkins and
// damaged_reports. For each near-duplicate pair WITHIN a cluster that does NOT
// already share an exact dedup_key (those are handled by the destructive cleanup
// in ingest.mjs --dedup), it queues a PENDING merge_candidate for an admin to
// confirm/reject. Real rows are never mutated here. Requires migration 0014.
// Reads keys from .env.local (process.env wins). See scripts/ingest.mjs.

import { readFileSync } from "node:fs";
import { clusterNames } from "./dedup-lib.mjs";

const DRY = process.argv.includes("--dry");
const THRESHOLD = 0.95; // same calibrated bar as the cleanup / tests

// --- env ---------------------------------------------------------------------
let fileEnv = {};
try {
  fileEnv = Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
} catch { /* no .env.local — rely on process.env */ }
const getEnv = (k) => process.env[k] || fileEnv[k];
const SUPA_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SECRET = getEnv("SUPABASE_SECRET_KEY");
if (!SUPA_URL || !SECRET) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}
const REST = `${SUPA_URL}/rest/v1`;
const H = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" };

// --- fetch all external rows of a table -------------------------------------
async function fetchAll(table, select) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${REST}/${table}?select=${select}&source=not.is.null`, {
      headers: { ...H, Range: `${from}-${from + 999}` },
    });
    if (!r.ok) break;
    const chunk = await r.json();
    if (!Array.isArray(chunk) || !chunk.length) break;
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return rows;
}

// Richness score: which row of a pair we'd KEEP. Mirrors ingest.mjs --dedup so a
// confirmed merge agrees with the import's idea of the canonical copy.
const PERSON_RANK = {
  "desaparecidosterremotovenezuela.com": 5,
  "venezuelatebusca.com": 4,
  "terremotovenezuela.app": 3,
  "terremotovenezuela2026": 2,
  "terremotovenezuela.com": 1,
};
const scoreCheckin = (r) =>
  (r.photo_url ? 1e5 : 0) + (PERSON_RANK[r.source] ?? 0) * 1000 + (r.message ? r.message.length : 0);
const scoreDamaged = (r) =>
  (r.photo_url ? 1e5 : 0) + (r.description ? r.description.length : 0);

// --- build candidate pairs for one table ------------------------------------
// nameOf: how to get the comparable name from a row (place_name vs name).
function buildPairs({ rows, nameOf, score }) {
  const names = rows.map(nameOf);
  const { clusters, skippedBuckets } = clusterNames(names, THRESHOLD);
  const pairs = [];
  for (const cluster of clusters) {
    if (cluster.length < 2) continue;
    // Order cluster richest-first → cluster[0] is the natural keep.
    const ordered = [...cluster].sort((a, b) => score(rows[b]) - score(rows[a]));
    const keep = rows[ordered[0]];
    for (const idx of ordered.slice(1)) {
      const dup = rows[idx];
      if (keep.id === dup.id) continue;
      // Skip exact dedup_key collisions — the destructive cleanup already owns
      // those. We only queue near-but-not-exact pairs that need human eyes.
      if (keep.dedup_key && dup.dedup_key && keep.dedup_key === dup.dedup_key) continue;
      pairs.push({ keep_id: keep.id, dup_id: dup.id, confidence: THRESHOLD });
    }
  }
  return { pairs, skippedBuckets };
}

// --- upsert PENDING candidates (idempotent via the pair unique index) --------
async function queue(table, pairs) {
  if (!pairs.length) return 0;
  const body = pairs.map((p) => ({ table_name: table, ...p, reason: "fuzzy-name" }));
  let queued = 0;
  for (let i = 0; i < body.length; i += 500) {
    const batch = body.slice(i, i + 500);
    const r = await fetch(`${REST}/merge_candidates`, {
      method: "POST",
      // ignore-duplicates: re-running won't churn already-decided pairs.
      headers: { ...H, Prefer: "return=minimal,resolution=ignore-duplicates" },
      body: JSON.stringify(batch),
    });
    if (!r.ok) {
      console.log(`  queue ${table} batch failed (${r.status}): ${(await r.text()).slice(0, 160)}`);
      continue;
    }
    queued += batch.length;
    process.stdout.write(`  ${table}: queued ${queued}/${body.length}\r`);
  }
  process.stdout.write("\n");
  return queued;
}

async function main() {
  console.log(`Suggest merges ${DRY ? "(DRY RUN)" : ""} → ${SUPA_URL}\n`);

  const checkins = await fetchAll("checkins", "id,name,dedup_key,photo_url,message,source");
  const cRes = buildPairs({ rows: checkins, nameOf: (r) => r.name || "", score: scoreCheckin });
  console.log(`checkins: ${checkins.length} rows → ${cRes.pairs.length} near-duplicate pairs` +
    (cRes.skippedBuckets ? ` (${cRes.skippedBuckets} buckets too large, reported not dropped)` : ""));

  const damaged = await fetchAll("damaged_reports", "id,place_name,dedup_key,photo_url,description,source");
  const dRes = buildPairs({ rows: damaged, nameOf: (r) => r.place_name || "", score: scoreDamaged });
  console.log(`damaged_reports: ${damaged.length} rows → ${dRes.pairs.length} near-duplicate pairs` +
    (dRes.skippedBuckets ? ` (${dRes.skippedBuckets} buckets too large, reported not dropped)` : ""));

  if (DRY) {
    console.log("\n(dry run — nothing written)");
    const sample = [...cRes.pairs.slice(0, 3), ...dRes.pairs.slice(0, 3)];
    if (sample.length) console.log("sample pairs:", JSON.stringify(sample, null, 2));
    return;
  }

  const qc = await queue("checkins", cRes.pairs);
  const qd = await queue("damaged_reports", dRes.pairs);
  console.log(`\nQueued ${qc + qd} PENDING merge candidate(s) for review.`);
  console.log("Review them in /admin (merge_candidates), confirm or reject — nothing was deleted.");
}

main().catch((e) => { console.error(e); process.exit(1); });
