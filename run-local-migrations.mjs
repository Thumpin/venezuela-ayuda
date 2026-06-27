import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const connectionString = "postgresql://postgres:postgres@localhost:5432/mapa_emergencia";
const pool = new pg.Pool({ connectionString });

async function run() {
  try {
    // 1. Ensure tracking table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS applied_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 2. Fetch already applied migration versions
    const res = await pool.query("SELECT version FROM applied_migrations");
    const applied = new Set(res.rows.map((row) => row.version));

    // 3. Find files in supabase/migrations/
    const dir = "./supabase/migrations";
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => ({
        file: f,
        version: f.match(/^(\d+)/)?.[1],
        path: join(dir, f)
      }))
      .filter((m) => m.version)
      .sort((a, b) => Number(a.version) - Number(b.version));

    console.log(`Checking ${files.length} migrations...`);

    let count = 0;
    for (const m of files) {
      if (applied.has(m.version)) {
        console.log(`✓ ${m.version} already applied`);
        continue;
      }

      console.log(`→ Applying ${m.file}...`);
      const sql = readFileSync(m.path, "utf8");
      
      // Execute the migration content
      await pool.query(sql);

      // Record it
      await pool.query("INSERT INTO applied_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", [m.version]);
      console.log(`✓ Applied ${m.version}`);
      count++;
    }

    console.log(`Done. Applied ${count} new migration(s).`);
  } catch (err) {
    console.error("Migration execution failed:", err);
  } finally {
    await pool.end();
  }
}

run();
