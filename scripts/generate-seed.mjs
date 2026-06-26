// Generates realistic seed data for local development.
// Outputs to stdout as SQL suitable for supabase/seed.sql.
//
// Usage:
//   node scripts/generate-seed.mjs > supabase/seed.sql
//
// The data is synthetic but realistic — Venezuelan names, cities, places.

const NAMES_M = [
  "José Gregorio Hernández", "Luis Alberto Martínez", "Carlos Andrés Pérez",
  "Juan Pablo Rondón", "Miguel Ángel Silva", "Rafael José Caldera",
  "Pedro Manuel García", "Francisco Javier Moreno", "Diego Alejandro Rodríguez",
  "Alberto José Giménez", "Jesús Enrique Salazar", "Antonio Rafael Castillo",
  "Manuel Alejandro Blanco", "Gustavo Adolfo Torres", "Víctor Manuel Rivas",
  "Óscar Enrique Medina", "Santiago José Peña", "Jorge Luis Herrera",
  "Andrés Eduardo Contreras", "Héctor José Montero",
];

const NAMES_F = [
  "María Isabel Rodríguez", "Ana Lucía Fernández", "Carmen Elena Martínez",
  "Rosa María Pérez", "Martha Josefina González", "Laura Patricia Sánchez",
  "Sofía Alejandra Castro", "Valentina Isabel Rojas", "Gabriela del Carmen Mora",
  "Isabel Cristina Torres", "Daniela Alexandra Paredes", "Adriana Beatriz Silva",
  "Yolanda Patricia Contreras", "Natalia Carolina Méndez", "Paola Andreína Rincón",
  "Alejandra María Vargas", "Katherine del Valle Salas", "Michelle Andreína Peña",
  "Yusmery Coromoto León", "Francys del Carmen Medina",
];

const CITIES = [
  "Caracas", "Maracay", "Valencia", "Barquisimeto", "Maracaibo",
  "La Guaira", "Los Teques", "San Felipe", "Morón", "Puerto Cabello",
  "Cúa", "Charallave", "Ocumare del Tuy", "Santa Teresa", "San Juan de los Morros",
  "Tinaquillo", "Guacara", "Naguanagua", "San Diego", "Turmero",
  "Cagua", "Palo Negro", "Las Tejerías", "Colonia Tovar", "El Hatillo",
  "Baruta", "Chacao", "Catia", "Petare", "El Valle",
];

const PLACES = [
  "Edificio Don Carlos – Av. Bolívar", "Residencias Río Chico – Calle 5",
  "Urbanización El Marqués – Calle 8", "Barrio Unión – Sector La Cruz",
  "Conjunto Residencial Las Ánimas", "Edificio Savoy – Plaza Miranda",
  "Urbanización Los Sauces – Av. Principal", "Bloque 4 – 23 de Enero",
  "Residencias Parque del Este", "Quinta Lourdes – La Castellana",
  "Urbanización La Viña – Sector Los Naranjos", "Edificio Torreón – Calle Sucre",
  "Barrio San José – Calle 7", "Condominio Altamira Sur",
  "Conjunto Residencial El Bosque", "Edificio Cristal – Av. Urdaneta",
  "Urbanización Las Flores – Calle 3", "Residencias La California – Av. Rómulo Gallegos",
  "Bloque 10 – El Valle", "Sector El Cementerio – Calle 12",
];

const SOURCES = [
  "venezuela-ayuda.com", "terremotovenezuela2026.vercel.app",
  "desaparecidosterremotovenezuela.com", "venezuelatebusca.com",
  "terremotovenezuela.com", "terremotovenezuela.app", "terremotove.netlify.app",
];

const STATUSES = ["SAFE", "LOOKING_FOR_SOMEONE", "NEEDS_HELP"];
const DAMAGE_SEVERITIES = ["CRACKS", "PARTIAL", "COLLAPSE_RISK", "COLLAPSED"];
const HELP_CATS = ["medical", "food", "water", "shelter", "transportation", "electricity", "rescue", "tools"];
const OFFER_CATS = ["transportation", "food", "shelter", "medical", "supplies", "translation"];
const URGENCIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  const copy = [...arr];
  const result = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function ago(days) {
  const d = new Date(Date.now() - days * 86400000 - Math.random() * 86400000 * 3);
  return d.toISOString().replace("T", " ").replace(/\.\d{3}/, "");
}
function phone() {
  const prefixes = ["0412", "0414", "0416", "0424", "0426"];
  return pick(prefixes) + String(Math.floor(1000000 + Math.random() * 9000000));
}
function latLng() {
  // Venezuela bounding box roughly
  return {
    lat: 10.1 + Math.random() * 0.8,
    lng: -67.8 + Math.random() * 0.6,
  };
}

// ---- Checkins ----------------------------------------------------------------
const checkins = [];
const usedIds = new Set();

for (let i = 0; i < 30; i++) {
  const id = uuid();
  usedIds.add(id);
  const isFemale = Math.random() > 0.5;
  const name = pick(isFemale ? NAMES_F : NAMES_M);
  const city = pick(CITIES);
  const place = pick(PLACES);
  const status = pick(STATUSES);
  const ll = latLng();
  const hasPhoto = Math.random() > 0.4;
  const hasPhone = Math.random() > 0.3;
  const foundAt = status === "LOOKING_FOR_SOMEONE" && Math.random() > 0.7
    ? ago(Math.floor(Math.random() * 20 + 1)) : null;

  checkins.push({
    id, name, status, city, place_name: place,
    latitude: ll.lat.toFixed(6), longitude: ll.lng.toFixed(6),
    message: status === "NEEDS_HELP" ? `Necesito ayuda urgente en ${place}` : null,
    phone_private: hasPhone ? phone() : null,
    photo_url: hasPhoto ? `https://placehold.co/400x500/1a1a2e/eee?text=${encodeURIComponent(name.split(" ")[0])}` : null,
    created_at: ago(Math.floor(Math.random() * 60 + 1)),
    manage_token: Math.random() > 0.5 ? uuid() : null,
    found_at: foundAt,
    source: Math.random() > 0.7 ? pick(SOURCES) : null,
    source_url: null,
    hidden: false,
  });
}

// ---- Help Requests -----------------------------------------------------------
const requests = [];
for (let i = 0; i < 15; i++) {
  const id = uuid();
  usedIds.add(id);
  const cat = pick(HELP_CATS);
  const city = pick(CITIES);
  const place = pick(PLACES);
  const ll = latLng();
  const items = Math.random() > 0.5 ? JSON.stringify([
    { name: pick(["Agua", "Comida", "Medicinas", "Ropa", "Pañales", "Leche en polvo"]), qty: Math.floor(Math.random() * 10 + 1) },
    ...(Math.random() > 0.5 ? [{ name: pick(["Frazadas", "Colchonetas", "Linternas", "Baterías"]), qty: Math.floor(Math.random() * 10 + 1) }] : []),
  ]) : null;

  requests.push({
    id, category: cat,
    description: `Solicito ${cat === "medical" ? "atención médica" : cat === "food" ? "alimentos" : cat === "water" ? "agua potable" : cat === "shelter" ? "refugio temporal" : cat === "transportation" ? "transporte" : cat === "electricity" ? "generador eléctrico" : cat === "rescue" ? "rescate" : "herramientas"} en ${place}`,
    urgency: pick(URGENCIES), city, place_name: place,
    latitude: ll.lat.toFixed(6), longitude: ll.lng.toFixed(6),
    contact: phone(), status: pick(["OPEN", "IN_PROGRESS"]),
    created_at: ago(Math.floor(Math.random() * 45 + 1)),
    manage_token: uuid(), hidden: false, items, source: null, source_url: null, external_id: null,
  });
}

// ---- Help Offers -------------------------------------------------------------
const offers = [];
for (let i = 0; i < 10; i++) {
  const id = uuid();
  usedIds.add(id);
  const cat = pick(OFFER_CATS);
  const city = pick(CITIES);
  const ll = latLng();

  offers.push({
    id, category: cat,
    description: `Ofrezco ${cat === "transportation" ? "transporte en mi vehículo" : cat === "food" ? "comida preparada" : cat === "shelter" ? "alojamiento temporal" : cat === "medical" ? "asistencia médica básica" : cat === "supplies" ? "donación de suministros" : "servicios de traducción"}`,
    city, latitude: ll.lat.toFixed(6), longitude: ll.lng.toFixed(6),
    availability: "Lun–Dom 8:00–18:00", contact: phone(),
    available: Math.random() > 0.2, created_at: ago(Math.floor(Math.random() * 30 + 1)),
    hidden: false,
  });
}

// ---- Damaged Reports ---------------------------------------------------------
const damagedReports = [];
for (let i = 0; i < 20; i++) {
  const id = uuid();
  usedIds.add(id);
  const city = pick(CITIES);
  const place = pick(PLACES);
  const sev = pick(DAMAGE_SEVERITIES);
  const ll = latLng();

  damagedReports.push({
    id, place_name: place,
    description: sev === "COLLAPSED" ? "Edificio colapsado totalmente. Se requiere maquinaria pesada."
      : sev === "COLLAPSE_RISK" ? "Estructura con riesgo de colapso. Necesita evaluación urgente."
      : sev === "PARTIAL" ? "Daños parciales en muros y columnas."
      : "Grietas superficiales en paredes. Sin riesgo aparente.",
    severity: sev, city, latitude: ll.lat.toFixed(6), longitude: ll.lng.toFixed(6),
    contact: phone(), photo_url: Math.random() > 0.4 ? `https://placehold.co/600x400/8b0000/fff?text=Daño+${encodeURIComponent(sev)}` : null,
    status: pick(["OPEN", "IN_PROGRESS", "RESOLVED"]),
    manage_token: uuid(), created_at: ago(Math.floor(Math.random() * 60 + 1)),
    hidden: false, verified_at: Math.random() > 0.6 ? ago(Math.floor(Math.random() * 15 + 5)) : null,
    verified_by: Math.random() > 0.6 ? "admin@test.local" : null,
    source: Math.random() > 0.7 ? "kobo" : null, source_url: null, external_id: null, dedup_key: null,
    risk_level: Math.random() > 0.7 ? pick(["ROJO", "AMARILLO", "NINGUNA"]) : null,
    risk_priority: Math.random() > 0.8 ? true : false, risk_answers: null,
  });
}

// ---- Admin Emails ------------------------------------------------------------
const adminEmails = [
  { email: "admin@test.local", added_by: "seed", created_at: ago(30) },
  { email: "dev@test.local", added_by: "seed", created_at: ago(30) },
];

// ---- Merge Candidates --------------------------------------------------------
// We'll create pairs from existing checkins
const mergeCandidates = (() => {
  const pairs = [
    { keepIdx: 0, dupIdx: 1, tier: "HARD", confidence: 0.97, reason: "Mismo nombre exacto + misma zona", evidence: { cosine: 0.94, phone_match: true } },
    { keepIdx: 2, dupIdx: 3, tier: "HARD", confidence: 0.95, reason: "Nombre idéntico + mismo teléfono", evidence: { cosine: 0.91, phone_match: true } },
    { keepIdx: 4, dupIdx: 5, tier: "STRONG", confidence: 0.86, reason: "Nombre similar + misma ciudad", evidence: { cosine: 0.78 } },
    { keepIdx: 6, dupIdx: 7, tier: "STRONG", confidence: 0.82, reason: "Mismo nombre + foto similar", evidence: { cosine: 0.75, same_photo: true } },
    { keepIdx: 8, dupIdx: 9, tier: "STRONG", confidence: 0.79, reason: "Nombre similar + misma zona geográfica", evidence: { cosine: 0.71, geo_proximity: true } },
    { keepIdx: 10, dupIdx: 11, tier: "REVIEW", confidence: 0.65, reason: "Posible duplicado, nombres parecidos", evidence: { cosine: 0.58 } },
    { keepIdx: 12, dupIdx: 13, tier: "REVIEW", confidence: 0.6, reason: "Apellido similar, misma fuente", evidence: { cosine: 0.52 } },
    { keepIdx: 14, dupIdx: 15, tier: "REVIEW", confidence: 0.55, reason: "Nombre dudoso, revisar manualmente", evidence: { cosine: 0.48 } },
  ];

  return pairs.map((p, i) => {
    const keep = checkins[p.keepIdx];
    const dup = checkins[p.dupIdx];
    return {
      id: `mock-candidate-${i + 1}`,
      table_name: "checkins",
      keep_id: keep.id,
      dup_id: dup.id,
      confidence: p.confidence,
      reason: p.reason,
      tier: p.tier,
      status: "PENDING",
      evidence: JSON.stringify(p.evidence),
      decided_by: null,
      decided_at: null,
      created_at: ago(Math.floor(Math.random() * 10 + 1)),
    };
  });
})();

// ---- Reviewed Candidates -----------------------------------------------------
const reviewedCandidates = (() => {
  const decisions = [
    { keepIdx: 16, dupIdx: 17, tier: "HARD", confidence: 0.96, reason: "Mismo nombre exacto", evidence: { cosine: 0.93 }, status: "MERGED", decision: "duplicate", decided_by: "admin@test.local", daysAgo: 5 },
    { keepIdx: 18, dupIdx: 19, tier: "STRONG", confidence: 0.88, reason: "Nombre similar + misma zona", evidence: { cosine: 0.81 }, status: "MERGED", decision: "consolidate", decided_by: "admin@test.local", daysAgo: 3 },
    { keepIdx: 20, dupIdx: 21, tier: "REVIEW", confidence: 0.59, reason: "Nombre dudoso", evidence: { cosine: 0.45 }, status: "SKIPPED", decision: "skip", decided_by: null, daysAgo: 7 },
    { keepIdx: 22, dupIdx: 23, tier: "HARD", confidence: 0.97, reason: "Registro duplicado exacto", evidence: { cosine: 0.96, phone_match: true }, status: "MERGED", decision: "duplicate", decided_by: "dev@test.local", daysAgo: 2 },
    { keepIdx: 24, dupIdx: 25, tier: "STRONG", confidence: 0.83, reason: "Mismo nombre + misma ciudad", evidence: { cosine: 0.79 }, status: "MERGED", decision: "duplicate", decided_by: "admin@test.local", daysAgo: 1 },
  ];

  return decisions.map((d, i) => {
    const keep = checkins[d.keepIdx];
    const dup = checkins[d.dupIdx];
    return {
      id: `mock-reviewed-${i + 1}`,
      table_name: "checkins",
      keep_id: keep.id,
      dup_id: dup.id,
      confidence: d.confidence,
      reason: d.reason,
      tier: d.tier,
      status: d.status,
      decision: d.decision,
      evidence: JSON.stringify(d.evidence),
      decided_by: d.decided_by,
      decided_at: d.daysAgo ? ago(d.daysAgo) : null,
      created_at: ago(Math.floor(Math.random() * 15 + 10)),
    };
  });
})();

// ---- Output SQL --------------------------------------------------------------
function sqlStr(v) {
  if (v === null || v === undefined) return "NULL";
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

function sqlVal(row, cols) {
  return cols.map((c) => {
    if (c === "location") return "NULL"; // Let trigger compute it
    return sqlStr(row[c]);
  }).join(", ");
}

function sqlInsert(rows, cols, table) {
  if (!rows.length) return `-- No rows for ${table}`;
  const lines = rows.map((r) => `  (${sqlVal(r, cols)})`);
  return `INSERT INTO ${table} (${cols.join(", ")}) VALUES\n${lines.join(",\n")};\n`;
}

let sql = `-- Seed data for local development
-- Generated by scripts/generate-seed.mjs
-- Run: psql -f supabase/seed.sql
-- or: supabase db reset

BEGIN;

-- Clean existing data
DELETE FROM merge_candidates;
DELETE FROM admin_emails;
DELETE FROM damaged_reports;
DELETE FROM help_offers;
DELETE FROM help_requests;
DELETE FROM checkins;

-- Checkins
${sqlInsert(checkins, ["id", "name", "status", "city", "place_name", "latitude", "longitude", "location", "message", "phone_private", "photo_url", "created_at", "manage_token", "found_at", "source", "source_url", "hidden"], "checkins")}

-- Help Requests
${sqlInsert(requests, ["id", "category", "description", "urgency", "city", "place_name", "latitude", "longitude", "location", "contact", "status", "created_at", "manage_token", "hidden", "items", "source", "source_url", "external_id"], "help_requests")}

-- Help Offers
${sqlInsert(offers, ["id", "category", "description", "city", "latitude", "longitude", "location", "availability", "contact", "available", "created_at", "hidden"], "help_offers")}

-- Damaged Reports
${sqlInsert(damagedReports, ["id", "place_name", "description", "severity", "city", "latitude", "longitude", "location", "contact", "photo_url", "status", "manage_token", "created_at", "hidden", "verified_at", "verified_by", "source", "source_url", "external_id", "dedup_key", "risk_level", "risk_priority", "risk_answers"], "damaged_reports")}

-- Admin Emails
${sqlInsert(adminEmails, ["email", "added_by", "created_at"], "admin_emails")}

-- Merge Candidates
${sqlInsert(mergeCandidates, ["id", "table_name", "keep_id", "dup_id", "confidence", "reason", "tier", "status", "evidence", "decided_by", "decided_at", "created_at"], "merge_candidates")}

-- Mark some as reviewed
UPDATE merge_candidates SET status = 'MERGED', decided_by = 'admin@test.local', decided_at = NOW() - INTERVAL '2 days'
WHERE id IN ('mock-candidate-1', 'mock-candidate-2');
UPDATE merge_candidates SET status = 'SKIPPED', decided_at = NOW() - INTERVAL '1 day'
WHERE id = 'mock-candidate-3';
UPDATE merge_candidates SET status = 'MERGED', decided_by = 'dev@test.local', decided_at = NOW()
WHERE id = 'mock-candidate-4';

COMMIT;
`;

process.stdout.write(sql);
