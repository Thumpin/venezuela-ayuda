import pg from 'pg';

const { Client } = pg;
const dbUrl = "postgresql://postgres:postgres@localhost:5432/mapa_emergencia";

async function run() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  console.log("Connected to DB, inserting test cross-reference records...");

  try {
    // 1. Insert hospitalized patient record
    const hospRes = await client.query(`
      INSERT INTO hospitalized (nombre, apellido, ci, edad, hospital, status, fuentes, notas)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      "Carlos Eduardo",
      "Mendoza",
      "V-12345678",
      "29",
      "Hospital José María Vargas",
      "Estable",
      "Registro de Emergencia Vargas",
      "Paciente ingresado con traumatismos leves, en recuperación activa."
    ]);
    const hospitalizedId = hospRes.rows[0].id;
    console.log(`Successfully inserted hospitalized patient record. ID: ${hospitalizedId}`);

    // 2. Insert checkin (desaparecido/LOOKING_FOR_SOMEONE) record
    const checkinRes = await client.query(`
      INSERT INTO checkins (name, status, city, message, phone_private)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      "Carlos Eduardo Mendoza",
      "LOOKING_FOR_SOMEONE",
      "Caracas",
      "Buscando a mi primo Carlos Mendoza, perdimos contacto después del incidente.",
      "+58 412-5555555"
    ]);
    const checkinId = checkinRes.rows[0].id;
    console.log(`Successfully inserted checkin report (desaparecido). ID: ${checkinId}`);

    console.log("\nInsertion complete. Carlos Eduardo Mendoza matches in both tables and will show the hospital 🏥/✚ tag in UI!");
  } catch (err) {
    console.error("Error inserting test records:", err);
  } finally {
    await client.end();
  }
}

run();
