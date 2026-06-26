// Seeds collection_centers with the previously-hardcoded Venezuela relief centers
// and international collection points. Idempotent: clears prior source='seed' rows
// and re-inserts. Run once after migration 0014 (and again if this data changes).
//   node scripts/seed-centers.mjs
import { readFileSync } from "node:fs";

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
const REST = `${URL_}/rest/v1`;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const ACEPTAN = "Reciben: agua potable, alimentos no perecederos, insumos médicos, ropa y abrigos.";

// Venezuela centers → shown on the map.
const VE = [
  { state: "Miranda", address: "4ta avenida de Altamira, entre 9na y 10ma transversal; quinta El Bejucal.", lat: 10.4972, lng: -66.8521 },
  { state: "Aragua", address: "Av. 19 de Abril, C.C. La Capilla, piso 1, local 21. Maracay.", lat: 10.2538, lng: -67.6038 },
  { state: "Carabobo", address: "Av. Monseñor Adams, El Viñedo. Edificio Talislandia, mezzanina. Valencia.", lat: 10.1878, lng: -68.0009 },
  { state: "Barinas", address: "Av. Marqués del Pumar, diagonal al Hotel Comercio, Casa Azul. Barinas. 8:00am–6:00pm · Contacto 0412 569.33.30", lat: 8.6235, lng: -70.2078 },
];

// International centers → shown in the /ayudar-fuera list.
const ABROAD = [
  { country: "Colombia", city: "Bogotá", name: "Centro de acopio Bogotá", address: "Calle 104 #54-31, Barrio Pasadena, en Suba.", needs: ["centro-de-acopio"] },
  { country: "Colombia", city: "Santa Marta", name: "Centro de acopio Santa Marta", address: "Parque La Tenería, Carrera 2 con 1D36, cerca de Playa Los Cocos.", needs: ["centro-de-acopio"] },
  { country: "Colombia", city: "Bucaramanga", name: "Centro de acopio Bucaramanga", address: "Calle 18 #21-52 San Francisco, Bucaramanga Santander, diagonal a la Iglesia San Francisco.", needs: ["centro-de-acopio"] },
  { country: "Colombia", city: "Cali", name: "Centro de acopio Cali", address: "Carrera 28 B3 #72S-32 Comuneros II (cerca Troncal Unida).", needs: ["centro-de-acopio"] },
  { country: "Estados Unidos", city: "San Antonio, Texas", name: "Centro de acopio San Antonio TX", address: "16111 San Pedro Ave, San Antonio, TX 78232.", needs: ["centro-de-acopio"] },
  { country: "Estados Unidos", city: "Doral, Florida", name: "Global Empowerment Mission (GEM) Headquarters", address: "1850 NW 84th Avenue #100, Doral FL 33126.", needs: ["centro-de-acopio", "voluntarios"] },
  { country: "Panamá", city: "Panamá", name: "Centro de acopio Panamá", address: "Edificio El Hatillo P.B, Alcaldía de Panamá.", needs: ["centro-de-acopio"] },
  { country: "Panamá", city: "Panamá", name: "Centro de acopio Casa Club Parque Omar Panamá", address: "Casa Club Parque Omar.", needs: ["centro-de-acopio"] },
  { country: "Ecuador", city: "Quito", name: "Centro de acopio Quito", address: 'Av Naciones Unidas con Av 6 de Agosto, Quito-Norte - "Cachapas El Felix".', needs: ["centro-de-acopio"] },
  { country: "Ecuador", city: "Guayaquil", name: "Centro de acopio Guayaquil", address: 'Víctor Emilio Estrada y Jiguas, diagonal al Novagym Urdesa "Local Chamos Burger".', needs: ["centro-de-acopio"] },
  { country: "México", city: "Ciudad de México", name: "Pasticho Express · Centro de acopio solidario",
    description: "Insumos médicos: analgésicos y antipiréticos (paracetamol, ibuprofeno), antisépticos, material de curación (gasas, vendas, apósitos, algodón), suero salino, cremas antibióticas, sales de rehidratación, antidiarreicos, guantes, cubrebocas, gel antibacterial y termómetros.",
    address: "Centro Comercial Parques Polanco (al lado del Walmart), Lago Alberto 320, Granada, Miguel Hidalgo, Ciudad de México.", phone: "+52 55 49 14 5083", needs: ["centro-de-acopio"] },
];

// PostgREST bulk insert requires every row to have the SAME keys → project to a
// fixed shape, null for anything missing.
const COLS = [
  "name", "country", "state", "city", "address", "latitude", "longitude",
  "description", "resources", "organizers", "contact", "website",
  "can_ship_to_venezuela", "volunteers_count", "needs_volunteers", "needs",
  "verified", "source",
];
const shape = (o) => Object.fromEntries(COLS.map((k) => [k, o[k] ?? (k === "needs" ? [] : null)]));

const rows = [
  ...VE.map((c) =>
    shape({
      name: `Centro de acopio · ${c.state}`, country: "Venezuela", state: c.state,
      address: c.address, latitude: c.lat, longitude: c.lng, resources: ACEPTAN,
      needs: ["centro-de-acopio"], verified: true, source: "seed",
    }),
  ),
  ...ABROAD.map((p) =>
    shape({
      name: p.name, country: p.country, city: p.city, address: p.address,
      description: p.description ?? null, contact: p.phone ?? null, website: p.website ?? null,
      needs_volunteers: p.needs.includes("voluntarios"),
      needs: p.needs, verified: true, source: "seed",
    }),
  ),
];

// Idempotent: clear prior seed, re-insert.
const del = await fetch(`${REST}/collection_centers?source=eq.seed`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
if (!del.ok) { console.error(`delete failed: ${del.status} ${await del.text()}`); process.exit(1); }
const ins = await fetch(`${REST}/collection_centers`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(rows) });
if (!ins.ok) { console.error(`insert failed: ${ins.status} ${await ins.text()}`); process.exit(1); }
console.log(`Seeded ${rows.length} centers (${VE.length} Venezuela on the map, ${ABROAD.length} international).`);
