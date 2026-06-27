import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

const dbUrl = "postgresql://postgres:postgres@localhost:5432/mapa_emergencia";

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

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
function norm(s) {
  return s.toLowerCase().normalize("NFD").replace(DIACRITICS, "").trim();
}

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  console.log("Connected to database to seed hospitalized table.");

  let csvPath = path.join(process.cwd(), "supabase", "personas_hospitalizadas - Por revisar.csv");
  if (!fs.existsSync(csvPath)) {
    csvPath = path.join(process.cwd(), "personas_hospitalizadas - Por revisar.csv");
  }
  
  if (!fs.existsSync(csvPath)) {
    console.error("CSV file not found!");
    process.exit(1);
  }

  const text = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(text);
  if (rows.length < 2) {
    console.error("CSV is empty or invalid!");
    process.exit(1);
  }

  const header = rows[0].map(norm);
  const col = (name) => header.findIndex((h) => h === name);
  const iNombre = col("nombre");
  const iApellido = col("apellido");
  const iCI = col("ci");
  const iEdad = col("edad");
  const iHospital = col("hospital");
  const iStatus = col("status");
  const iFuentes = col("fuentes");
  const iNotas = col("notas");

  const get = (row, i) => i >= 0 && i < row.length ? row[i].trim() : "";

  // Truncate first
  await client.query('TRUNCATE TABLE hospitalized CASCADE;');

  const insertQuery = `
    INSERT INTO hospitalized (nombre, apellido, ci, edad, hospital, status, fuentes, notas)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `;

  let insertedCount = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const nombre = get(row, iNombre);
    const apellido = get(row, iApellido);
    if (!nombre && !apellido) continue;

    const ci = get(row, iCI);
    const edad = get(row, iEdad);
    const hospital = get(row, iHospital);
    const status = get(row, iStatus);
    const fuentes = get(row, iFuentes);
    const notas = get(row, iNotas);

    await client.query(insertQuery, [nombre, apellido, ci, edad, hospital, status, fuentes, notas]);
    insertedCount++;
  }

  console.log(`Seeding complete. Inserted ${insertedCount} hospitalized rows into database.`);
  await client.end();
}

main().catch(err => {
  console.error("Failed to seed hospitalized table:", err);
  process.exit(1);
});
