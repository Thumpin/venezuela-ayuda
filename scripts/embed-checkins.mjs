// Backfill AI embeddings for checkins — the 5th dedup signal (cosine) used by
// score_checkin_pair in migration 0015. Ported from the emergenciavzla brain's
// embed-ingest Edge Function, adapted to this app's REST + checkins schema.
//
//   node scripts/embed-checkins.mjs            # embed all rows missing one
//   node scripts/embed-checkins.mjs --dry      # build texts, print, call nothing
//   node scripts/embed-checkins.mjs --limit 200
//
// Provider: OpenAI text-embedding-3-small with dimensions=1024 (matches
// vector(1024) in 0015). Requires OPENAI_API_KEY. Without it → exits with a clear
// message (the schema + engine already work on 4 signals; this adds the 5th).
//
// PRIVACY: the embedded text is scrubbed of phones/cédulas right before the API
// call (defense-in-depth — even legacy rows that predate the ingest scrub never
// send PII to OpenAI). Phone numbers are NEVER part of the identity text.

import { readFileSync } from "node:fs";
import { scrubContactPII } from "./scrub-pii.mjs";

const DRY = process.argv.includes("--dry");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const OPENAI_URL = "https://api.openai.com/v1/embeddings";
const EMB_MODEL = "text-embedding-3-small"; // with dimensions=1024
const EMB_DIMS = 1024;                       // matches vector(1024) in 0015
const BATCH = 64;                            // rows per OpenAI request

// --- env (process.env wins; falls back to .env.local) ------------------------
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
const OPENAI_KEY = getEnv("OPENAI_API_KEY");
const REST = `${SUPA_URL}/rest/v1`;
const H = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" };

// Validate env only when actually running (not when imported by tests, which
// only need the pure checkinEmbedText export).
function requireEnv() {
  if (!SUPA_URL || !SECRET) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
    process.exit(1);
  }
  if (!OPENAI_KEY && !DRY) {
    console.error("Missing OPENAI_API_KEY — needed to generate embeddings (text-embedding-3-small, 1024 dims).");
    console.error("The dedup engine already works on 4 signals; this backfill adds the 5th (cosine).");
    process.exit(1);
  }
}

// --- identity text (EXTENSIBLE) ----------------------------------------------
// The text the embedding is computed over: what identifies the person. Add more
// pertinent fields here later (e.g. age band, gender) — this is the single place
// to change. NEVER include phone (private). `message` is scrubbed of any PII
// before joining, so no number/cédula reaches the provider.
export function checkinEmbedText(row) {
  const safeMessage = scrubContactPII(row.message).clean;
  return [
    row.name,
    row.place_name,
    safeMessage,
    // future: row.age_band, row.gender, ...
  ].filter(Boolean).join(" — ").slice(0, 800);
}

// --- OpenAI batch embed ------------------------------------------------------
async function openaiEmbed(texts) {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${OPENAI_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ input: texts, model: EMB_MODEL, dimensions: EMB_DIMS }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  // data.data is ordered by `index`; sort defensively.
  return (data?.data ?? [])
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

// --- fetch checkins missing an embedding -------------------------------------
async function fetchPending() {
  const rows = [];
  for (let from = 0; rows.length < LIMIT; from += 1000) {
    const r = await fetch(
      `${REST}/checkins?select=id,name,place_name,message&embedding=is.null&hidden=eq.false`,
      { headers: { ...H, Range: `${from}-${from + 999}` } },
    );
    if (!r.ok) {
      if (from === 0) throw new Error(`fetch checkins: ${r.status} ${(await r.text()).slice(0, 160)}`);
      break;
    }
    const chunk = await r.json();
    if (!Array.isArray(chunk) || !chunk.length) break;
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return Number.isFinite(LIMIT) ? rows.slice(0, LIMIT) : rows;
}

// pgvector accepts its text literal '[v1,v2,...]' through PostgREST.
const toVectorLiteral = (v) => `[${v.join(",")}]`;

async function main() {
  requireEnv();
  console.log(`Embed checkins ${DRY ? "(DRY RUN)" : ""} → ${SUPA_URL}\n`);

  const rows = await fetchPending();
  console.log(`${rows.length} checkin(s) missing an embedding`);
  if (!rows.length) { console.log("Nothing to embed."); return; }

  if (DRY) {
    console.log("\n(dry run — no OpenAI calls, nothing written)");
    for (const r of rows.slice(0, 5)) console.log(`  • ${checkinEmbedText(r)}`);
    return;
  }

  let embedded = 0, failed = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const texts = batch.map(checkinEmbedText);
    let vectors;
    try {
      vectors = await openaiEmbed(texts);
    } catch (e) {
      console.log(`\n  batch @${i} failed: ${e.message}`);
      failed += batch.length;
      continue;
    }
    if (vectors.length !== batch.length) {
      console.log(`\n  batch @${i}: OpenAI returned ${vectors.length} vectors for ${batch.length} rows — skipping`);
      failed += batch.length;
      continue;
    }
    // Persist each vector. PostgREST has no bulk-by-id update, so it's one PATCH
    // per row — but we run them through a concurrent worker pool (like
    // backfill-dedupkey.mjs) so the network round-trips overlap instead of
    // serializing. ~25× faster against a local/remote REST endpoint.
    const queue = batch.map((row, k) => ({ id: row.id, vec: vectors[k] }));
    const PATCH_CONC = 25;
    async function patchWorker() {
      let u;
      while ((u = queue.pop())) {
        const r = await fetch(`${REST}/checkins?id=eq.${u.id}`, {
          method: "PATCH",
          headers: { ...H, Prefer: "return=minimal" },
          body: JSON.stringify({ embedding: toVectorLiteral(u.vec), embedding_model: EMB_MODEL }),
        });
        if (r.ok) embedded++; else { failed++; if (failed <= 5) console.log(`\n  PATCH ${u.id}: ${r.status}`); }
      }
    }
    await Promise.all(Array.from({ length: PATCH_CONC }, patchWorker));
    process.stdout.write(`  embedded ${embedded}/${rows.length}\r`);
  }
  process.stdout.write("\n");
  console.log(`\nDone. Embedded ${embedded}, failed ${failed}, model ${EMB_MODEL}.`);
  console.log("Now re-run the engine to fold in the cosine signal:  select run_dedup_engine();");
}

// Run only when executed directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
