import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

const dbUrl = "postgresql://postgres:postgres@localhost:5432/mapa_emergencia";

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  console.log("Connected to local database.");

  const files = [
    'admin_emails.json',
    'checkins.json',
    'collection_centers.json',
    'damaged_reports.json',
    'help_offers.json',
    'help_requests.json',
    'request_responses.json',
    'sightings.json'
  ];

  for (const file of files) {
    const table = file.replace('.json', '');
    const filePath = path.join(process.cwd(), 'supabase', file);
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping missing file: ${file}`);
      continue;
    }

    console.log(`Seeding table: ${table}...`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(data) || data.length === 0) {
      console.log(`No rows to insert for ${table}.`);
      continue;
    }

    // Truncate table first to prevent duplicates/errors
    await client.query(`TRUNCATE TABLE "${table}" CASCADE;`);

    // We do bulk inserts in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      // Columns from the first row in the chunk (excluding generated columns like 'location')
      const columns = Object.keys(chunk[0]).filter(col => col !== 'location');
      
      const valuePlaceholders = [];
      const flatValues = [];
      
      chunk.forEach((row, rowIndex) => {
        const rowPlaceholders = [];
        columns.forEach((col, colIndex) => {
          rowPlaceholders.push(`$${rowIndex * columns.length + colIndex + 1}`);
          let val = row[col];
          // Convert objects/dicts and jsonb arrays to JSON string, leave text[] arrays alone
          if (val !== null && typeof val === 'object') {
            if (Array.isArray(val) && (col === 'needs' || col === 'scopes')) {
              // Leave as JS array so pg client serializes it to text[]
            } else {
              val = JSON.stringify(val);
            }
          }
          flatValues.push(val);
        });
        valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
      });

      const colNames = columns.map(c => `"${c}"`).join(', ');
      const query = `INSERT INTO "${table}" (${colNames}) VALUES ${valuePlaceholders.join(', ')};`;
      
      await client.query(query, flatValues);
    }
    console.log(`Successfully seeded ${data.length} rows into ${table}.`);
  }

  await client.end();
  console.log("Seeding completed successfully!");
}

main().catch(err => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
