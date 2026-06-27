import pg from 'pg';

const { Client } = pg;

const dbUrl = "postgresql://postgres:postgres@localhost:5432/mapa_emergencia";

function canonicalHospitalName(raw) {
  const norm = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (norm.includes("perez carreno") || norm.includes("yaguara")) {
    return "Hospital Miguel Pérez Carreño";
  }
  if (norm.includes("domingo luciani") || norm.includes("llanito")) {
    return "Hospital Domingo Luciani";
  }
  if (norm.includes("periferico de catia") || norm.includes("hospital de catia") || norm.includes("periferico catia")) {
    return "Hospital Periférico de Catia";
  }
  if (norm.includes("militar")) {
    return "Hospital Militar Universitario Dr. Carlos Arvelo";
  }
  if (norm.includes("vargas")) {
    return "Hospital José María Vargas";
  }
  if (norm.includes("perez de leon")) {
    return "Hospital Ana Francisca Pérez de León";
  }
  if (norm.includes("el avila")) {
    return "Clínica El Ávila";
  }
  if (norm.includes("seguro social") || norm.includes("sego social")) {
    return "Hospital Seguro Social de La Guaira";
  }
  if (norm.includes("pariata")) {
    return "Hospital Rafael Medina Jiménez (Pariata)";
  }
  if (norm.includes("rios")) {
    return "Hospital de Niños J. M. de los Ríos";
  }
  if (norm.includes("universitario de caracas") || norm.includes("huc")) {
    return "Hospital Universitario de Caracas";
  }
  if (norm.includes("valle")) {
    return "Materno Infantil Hugo Chávez Frías (El Valle)";
  }
  if (norm.includes("cruz roja")) {
    return "Cruz Roja Venezolana";
  }
  if (norm.includes("chacao")) {
    return "Alcaldía de Chacao - Salud Chacao";
  }
  if (norm.includes("baquero")) {
    return "Hospital Ricardo Baquero González";
  }
  
  if (norm.length < 5 || norm === "lista pared" || norm.includes("informado en")) {
    return null;
  }
  
  return raw.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  console.log("Connected to database to check and register hospitals.");

  // 1. Get all distinct hospital strings from hospitalized
  const res = await client.query('SELECT DISTINCT hospital FROM hospitalized');
  const rawHospitals = res.rows.map(r => r.hospital).filter(Boolean);

  const canonicals = new Set();
  for (const raw of rawHospitals) {
    const canonical = canonicalHospitalName(raw);
    if (canonical) {
      canonicals.add(canonical);
    }
  }

  console.log(`Identified ${canonicals.size} canonical hospitals.`);

  // 2. Load existing centers
  const centerRes = await client.query('SELECT name FROM collection_centers');
  const existingNames = new Set(centerRes.rows.map(r => r.name.toLowerCase()));

  // 3. Register missing hospitals
  let insertedCount = 0;
  for (const name of canonicals) {
    if (!existingNames.has(name.toLowerCase())) {
      console.log(`Registering missing hospital as preliminary center: "${name}"`);
      await client.query(
        `INSERT INTO collection_centers (name, country, city, description, needs, verified, hidden, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          name, 
          'Venezuela', 
          name.includes('La Guaira') ? 'La Guaira' : 'Caracas', 
          '[Registro preliminar]: Centro hospitalario detectado en el registro de pacientes. Pendiente de completar detalles.',
          ['insumos-medicos'], 
          false, 
          false,
          'hospital-cross-reference'
        ]
      );
      insertedCount++;
    } else {
      console.log(`Hospital already registered: "${name}"`);
    }
  }

  console.log(`Finished. Registered ${insertedCount} new hospitals as preliminary centers.`);
  await client.end();
}

main().catch(err => {
  console.error("Failed to register hospitals:", err);
  process.exit(1);
});
