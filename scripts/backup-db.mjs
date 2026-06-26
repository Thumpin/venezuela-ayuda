// Logical backup of all tables to local JSON (full rows, incl. private fields).
// Works without the paid Supabase plan — uses the REST API + secret key.
// Output: backups/<UTC-timestamp>/<table>.json  (gitignored — contains PII).
//   node scripts/backup-db.mjs
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

let env = {};
try {
  env = Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
} catch {}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || env.SUPABASE_SECRET_KEY;
if (!URL_ || !KEY) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY"); process.exit(1); }
const REST = `${URL_}/rest/v1`;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const TABLES = [
  "checkins", "help_requests", "help_offers", "damaged_reports",
  "sightings", "request_responses", "collection_centers",
  "admin_emails", "applied_migrations",
];

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = new URL(`../backups/${stamp}/`, import.meta.url);
mkdirSync(dir, { recursive: true });
console.log(`Backup → backups/${stamp}/`);

for (const table of TABLES) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${REST}/${table}?select=*`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    if (!r.ok) { console.log(`  ${table}: skipped (${r.status})`); rows.length = 0; break; }
    const chunk = await r.json();
    if (!Array.isArray(chunk) || !chunk.length) break;
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  writeFileSync(new URL(`${table}.json`, dir), JSON.stringify(rows));
  console.log(`  ${table}: ${rows.length} rows`);
}
console.log("Done.");
