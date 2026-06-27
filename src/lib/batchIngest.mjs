// Parses an admin-pasted data dump (JSON / CSV / SQL) into the canonical report
// shape that buildRow() consumes. PURE + testable (`node --test`): no DB, no SQL
// execution — for SQL it only *extracts the data* from INSERT … VALUES tuples.
//
// All three formats converge on the same objects:
//   { type, external_id, name?, status?, category?, description?, urgency?,
//     severity?, city?, latitude?, longitude?, contact?, message?, place_name?,
//     photo_url?, source_url?, availability?, available? }
// `type` ∈ checkin | missing_person | help_request | help_offer | damaged_building.

// Map a SQL table name (a dump of our own tables) to the report `type`, so an
// INSERT into e.g. help_requests yields type "help_request".
const TABLE_TO_TYPE = {
  checkins: "checkin",
  help_requests: "help_request",
  help_offers: "help_offer",
  damaged_reports: "damaged_building",
};

export function detectFormat(text) {
  const t = (text || "").trim();
  if (!t) return "empty";
  if (t[0] === "[" || t[0] === "{") return "json";
  if (/\binsert\s+into\b/i.test(t)) return "sql";
  return "csv";
}

// --- JSON --------------------------------------------------------------------
function parseJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON inválido: ${e.message}`);
  }
  const arr = Array.isArray(data) ? data : Array.isArray(data?.reports) ? data.reports : null;
  if (!arr) throw new Error("Se esperaba un arreglo de reportes (o { reports: [...] }).");
  return arr;
}

// --- CSV (RFC-4180-ish: quoted fields, "" escaping, CRLF) --------------------
function parseCsvRows(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); if (row.some((x) => x !== "")) rows.push(row); row = []; cur = "";
    } else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); if (row.some((x) => x !== "")) rows.push(row); }
  return rows;
}

function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error("CSV vacío o sin filas de datos.");
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => { const v = (r[i] ?? "").trim(); if (v !== "") o[h] = v; });
    return o;
  });
}

// --- SQL: extract rows from INSERT … VALUES (data only, never executed) -------
function splitTuple(s) {
  // Split a "v1, v2, 'a, b', NULL" value list on top-level commas, honoring
  // single-quoted strings with '' escaping.
  const out = []; let cur = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === "'") { if (s[i + 1] === "'") { cur += "'"; i++; } else { q = false; cur += c; } }
      else cur += c;
    } else if (c === "'") { q = true; cur += c; }
    else if (c === ",") { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  if (cur.trim() !== "") out.push(cur.trim());
  return out;
}

function sqlValue(tok) {
  if (/^null$/i.test(tok)) return null;
  if (tok[0] === "'" && tok[tok.length - 1] === "'") return tok.slice(1, -1).replace(/''/g, "'");
  if (/^-?\d+(\.\d+)?$/.test(tok)) return Number(tok);
  if (/^(true|false)$/i.test(tok)) return /^true$/i.test(tok);
  return tok;
}

function parseSql(text) {
  const reports = [];
  // Match: INSERT INTO <table> ( <cols> ) VALUES <tuples> ;
  const re = /insert\s+into\s+["`]?(\w+)["`]?\s*\(([^)]+)\)\s*values\s*(.+?);/gis;
  let m;
  while ((m = re.exec(text))) {
    const table = m[1].toLowerCase();
    const type = TABLE_TO_TYPE[table] || table; // unknown table → pass through, buildRow will reject
    const cols = m[2].split(",").map((c) => c.trim().replace(/^["`]|["`]$/g, ""));
    // Split the VALUES section into per-row "( … )" groups at top level.
    const groups = m[3].match(/\(([^()]*(?:'[^']*'[^()]*)*)\)/g) || [];
    for (const g of groups) {
      const vals = splitTuple(g.slice(1, -1)).map(sqlValue);
      const o = { type };
      cols.forEach((c, i) => { if (i < vals.length && vals[i] !== null) o[c] = vals[i]; });
      // A dump of our own tables stores the phone in phone_private; map it back to
      // the report's `contact` field so buildRow routes it to the private column.
      if (o.phone_private != null && o.contact == null) { o.contact = o.phone_private; delete o.phone_private; }
      reports.push(o);
    }
  }
  if (!reports.length) throw new Error("No se encontraron filas en sentencias INSERT … VALUES.");
  return reports;
}

// Returns the parsed report objects (unvalidated — buildRow validates downstream).
// `format` ∈ 'auto' | 'json' | 'csv' | 'sql'.
export function parseDump(text, format = "auto") {
  const fmt = format === "auto" ? detectFormat(text) : format;
  if (fmt === "empty") throw new Error("El contenido está vacío.");
  if (fmt === "json") return parseJson(text);
  if (fmt === "csv") return parseCsv(text);
  if (fmt === "sql") return parseSql(text);
  throw new Error(`Formato no soportado: ${fmt}`);
}
