import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

const dbUrl = "postgresql://postgres:postgres@localhost:5432/mapa_emergencia";

// Lowercase + strip diacritics
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
function norm(s) {
  return s.toLowerCase().normalize("NFD").replace(DIACRITICS, "").trim();
}

function fuzzyKey(name) {
  return norm(name).replace(/\s+/g, "");
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/);
  return lines.map(line => {
    const row = [];
    let inQuotes = false;
    let current = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        row.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    row.push(current);
    return row;
  }).filter(r => r.length > 1);
}

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  console.log("Connected to database for cross-referencing.");

  // 1. Read Hospital Registry CSV
  const filePath = path.join(process.cwd(), "personas_hospitalizadas - Por revisar.csv");
  if (!fs.existsSync(filePath)) {
    console.error("Hospital registry CSV not found!");
    process.exit(1);
  }
  const text = fs.readFileSync(filePath, "utf8");
  const rows = parseCsv(text);
  
  const header = rows[0].map(norm);
  const col = (name) => header.findIndex((h) => h === name);
  const iNombre = col("nombre");
  const iApellido = col("apellido");
  const iHospital = col("hospital");
  const iNotes = col("notas");
  
  const get = (row, i) => i >= 0 && i < row.length ? row[i].trim() : "";

  const hospitalized = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const nombre = get(row, iNombre);
    const apellido = get(row, iApellido);
    if (!nombre && !apellido) continue;
    const fullName = [nombre, apellido].filter(Boolean).join(" ");
    const hospital = get(row, iHospital);
    const notes = get(row, iNotes);
    hospitalized.push({
      name: fullName,
      key: fuzzyKey(fullName),
      hospital,
      notes
    });
  }
  console.log(`Loaded ${hospitalized.length} hospitalized records from CSV.`);

  // 2. Load missing persons from database
  const res = await client.query(
    `SELECT id, name, message, status FROM checkins WHERE status = 'LOOKING_FOR_SOMEONE'`
  );
  const missingCheckins = res.rows;
  console.log(`Loaded ${missingCheckins.length} missing check-ins from database.`);

  // 3. Perform matching
  let matchCount = 0;
  for (const checkin of missingCheckins) {
    const checkinKey = fuzzyKey(checkin.name);
    // Find exact fuzzyKey matches
    const match = hospitalized.find(h => h.key === checkinKey);
    if (match) {
      matchCount++;
      const newStatus = 'SAFE';
      const updatedMessage = `${checkin.message ? checkin.message + '\n' : ''}[Auto-localizado]: Encontrado en hospital: ${match.hospital}${match.notes ? ' (' + match.notes + ')' : ''}`;
      
      console.log(`[MATCH FOUND] Database Name: "${checkin.name}" (ID: ${checkin.id}) matched Hospital: "${match.name}" at "${match.hospital}"`);
      
      // 4. Update status and message in the database
      await client.query(
        `UPDATE checkins SET status = $1, message = $2 WHERE id = $3`,
        [newStatus, updatedMessage, checkin.id]
      );
    }
  }

  console.log(`Cross-referencing finished. Total matches updated to SAFE: ${matchCount}`);
  await client.end();
}

main().catch(err => {
  console.error("Cross-reference failed:", err);
  process.exit(1);
});
