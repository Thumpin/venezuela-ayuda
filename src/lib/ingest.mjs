// Lógica de ingesta del hub: valida un reporte entrante y lo proyecta a la fila
// canónica de su tabla. Puro y testeable (`node --test`). No transforma a un
// formato nuevo — usa las columnas que ya existen; solo rutea por `type`,
// estampa el `source` del socio y manda el contacto a campo privado.
//
// Espeja las reglas de src/lib/validation.ts (clamp de longitud, control chars,
// bounding box VE). No lo importa porque validation.ts es TS y este módulo lo
// carga `node --test`. Reusa fuzzyKey de scripts/dedup-lib.mjs para dedup_key.

import { fuzzyKey } from "../../scripts/dedup-lib.mjs";

// Enums canónicos (espejo de src/lib/constants.ts).
const HELP_CATEGORIES = ["medical", "food", "water", "shelter", "transportation", "electricity", "rescue", "tools"];
const OFFER_CATEGORIES = ["transportation", "food", "shelter", "medical", "supplies", "translation"];
const URGENCY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const SEVERITY = ["CRACKS", "PARTIAL", "COLLAPSE_RISK", "COLLAPSED"];
const CHECKIN_STATUS = ["SAFE", "NEEDS_HELP", "LOOKING_FOR_SOMEONE"];
const REQUEST_STATUS = ["OPEN", "IN_PROGRESS", "RESOLVED"];

const LIMITS = { name: 80, city: 80, message: 500, description: 800, phone: 30, availability: 200, place_name: 120, source_url: 500, photo_url: 500 };

const CONTROL = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]", "g");
const VE = { minLat: 0, maxLat: 16, minLng: -74, maxLng: -59 };

// Limpia y recorta texto; null si vacío.
function clean(v, max) {
  if (typeof v !== "string") return null;
  const s = v.replace(CONTROL, "").replace(/\s+/g, " ").trim().slice(0, max);
  return s.length ? s : null;
}

// Coords válidas dentro del bounding box VE, o null (no rechaza la fila).
function coords(lat, lng) {
  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { latitude: null, longitude: null };
  if (a < VE.minLat || a > VE.maxLat || b < VE.minLng || b > VE.maxLng) return { latitude: null, longitude: null };
  return { latitude: a, longitude: b };
}

const oneOf = (v, set, fallback = null) => (set.includes(v) ? v : fallback);
const err = (m) => ({ ok: false, error: m });

// help_offer.available: default true; clientes con JSON laxo pueden mandar
// false/"false"/0/"0"/"no" → tratarlos como NO disponible (no voltearlos a true).
const UNAVAILABLE = new Set([false, "false", 0, "0", "no"]);
const isAvailable = (v) => !UNAVAILABLE.has(typeof v === "string" ? v.toLowerCase() : v);

// report (forma canónica del socio) + source (de la key) → { ok, table, row } | { ok:false, error }
export function buildRow(report, source) {
  if (!report || typeof report !== "object") return err("reporte inválido");
  const external_id = clean(report.external_id, 200);
  if (!external_id) return err("external_id requerido");

  const source_url = clean(report.source_url, LIMITS.source_url);
  const photo_url = clean(report.photo_url, LIMITS.photo_url);
  const city = clean(report.city, LIMITS.city);
  const place_name = clean(report.place_name, LIMITS.place_name);
  const { latitude, longitude } = coords(report.latitude, report.longitude);
  const contact = clean(report.contact, LIMITS.phone);
  const base = { source, source_url, external_id }; // source SIEMPRE de la key

  switch (report.type) {
    case "missing_person":
    case "checkin": {
      const name = clean(report.name, LIMITS.name);
      if (!name) return err("name requerido");
      const status =
        report.type === "missing_person"
          ? "LOOKING_FOR_SOMEONE"
          : oneOf(report.status, CHECKIN_STATUS, "SAFE");
      return {
        ok: true,
        table: "checkins",
        row: {
          ...base, name, status, city, latitude, longitude,
          message: clean(report.message, LIMITS.message),
          phone_private: contact, // PRIVADO
          photo_url, place_name,
          dedup_key: fuzzyKey(name),
        },
      };
    }
    case "help_request": {
      const category = oneOf(report.category, HELP_CATEGORIES);
      if (!category) return err("category inválida para help_request");
      const description = clean(report.description, LIMITS.description);
      if (!description) return err("description requerida");
      return {
        ok: true,
        table: "help_requests",
        row: {
          ...base, category, description,
          urgency: oneOf(report.urgency, URGENCY, "MEDIUM"),
          status: oneOf(report.status, REQUEST_STATUS, "OPEN"),
          city, latitude, longitude, place_name,
          contact, // PRIVADO
        },
      };
    }
    case "help_offer": {
      const category = oneOf(report.category, OFFER_CATEGORIES);
      if (!category) return err("category inválida para help_offer");
      return {
        ok: true,
        table: "help_offers",
        row: {
          ...base, category,
          description: clean(report.description, LIMITS.description),
          city, latitude, longitude,
          availability: clean(report.availability, LIMITS.availability),
          available: isAvailable(report.available),
          contact, // PRIVADO
        },
      };
    }
    case "damaged_building": {
      const name = clean(report.place_name, LIMITS.place_name) || clean(report.name, LIMITS.name);
      if (!name) return err("place_name requerido");
      return {
        ok: true,
        table: "damaged_reports",
        row: {
          ...base, place_name: name,
          description: clean(report.description, LIMITS.description),
          severity: oneOf(report.severity, SEVERITY, "PARTIAL"),
          city, latitude, longitude, photo_url,
          contact, // PRIVADO (damaged_reports.contact, 0005)
          dedup_key: fuzzyKey(name),
        },
      };
    }
    default:
      return err(`type desconocido: ${report.type}`);
  }
}

// Tablas válidas (para el upsert por lotes en la ruta).
export const INGEST_TABLES = ["checkins", "help_requests", "help_offers", "damaged_reports"];
