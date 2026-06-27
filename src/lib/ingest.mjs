// Lógica de ingesta del hub: valida un reporte entrante y lo proyecta a la fila
// canónica de su tabla. Puro y testeable (`node --test`). No transforma a un
// formato nuevo — usa las columnas que ya existen; solo rutea por `type`,
// estampa el `source` del socio y manda el contacto a campo privado.
//
// Espeja las reglas de src/lib/validation.ts (clamp de longitud, control chars,
// bounding box VE). No lo importa porque validation.ts es TS y este módulo lo
// carga `node --test`. Enums y límites vienen de canonical.mjs (única fuente de
// verdad, compartida con constants.ts). Reusa fuzzyKey de dedup-lib.mjs.

import { fuzzyKey } from "../../scripts/dedup-lib.mjs";
import {
  HELP_CATEGORIES,
  OFFER_CATEGORIES,
  URGENCY,
  SEVERITY,
  CHECKIN_STATUS,
  REQUEST_STATUS,
  CHILD_STATUS,
  CHILD_GENDER,
  CHILD_INFO_SOURCE,
  LIMITS,
} from "./canonical.mjs";

const CONTROL = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]", "g");
// Bounding box de Venezuela. Exportado para que patch.mjs aplique la MISMA regla
// de coords sin duplicar el rango.
export const VE = { minLat: 0, maxLat: 16, minLng: -74, maxLng: -59 };

// Limpia y recorta texto; null si vacío. Exportado: la validación del PATCH
// espeja exactamente este clamp/strip de control chars.
export function clean(v, max) {
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

// Fecha ISO `YYYY-MM-DD` (la parte de fecha de un date de Postgres), o null.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const cleanDate = (v) => (typeof v === "string" && ISO_DATE.test(v.trim()) ? v.trim() : null);

// "true"/"false"/bool → boolean, o null si no viene. Para direct_contact.
function cleanBool(v) {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return null;
}

// help_offer.available: default true; clientes con JSON laxo pueden mandar
// false/"false"/0/"0"/"no" → tratarlos como NO disponible (no voltearlos a true).
const UNAVAILABLE = new Set([false, "false", 0, "0", "no"]);
export const isAvailable = (v) => !UNAVAILABLE.has(typeof v === "string" ? v.toLowerCase() : v);

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
      // help_requests exige coordenadas en DB (check has_location). Validar acá
      // → el cliente recibe un rechazo claro en vez de un error de DB genérico.
      // coords() ya devolvió null si faltan o caen fuera del bounding box VE.
      if (latitude === null || longitude === null)
        return err("help_request requiere coordenadas válidas dentro de Venezuela (latitude y longitude)");
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
    case "unaccompanied_child": {
      const name = clean(report.name, LIMITS.name);
      if (!name) return err("name requerido");
      return {
        ok: true,
        table: "unaccompanied_children",
        row: {
          ...base, name,
          reporter_name: clean(report.reporter_name, LIMITS.name), // PRIVADO
          age: clean(report.age, LIMITS.age),
          gender: oneOf(report.gender, CHILD_GENDER),
          description: clean(report.description, LIMITS.description),
          found_place: clean(report.found_place, LIMITS.found_place),
          found_at: cleanDate(report.found_at),
          last_seen_at: cleanDate(report.last_seen_at),
          hospital: clean(report.hospital, LIMITS.hospital),
          last_seen_place: clean(report.last_seen_place, LIMITS.last_seen_place),
          status: oneOf(report.status, CHILD_STATUS, "ALONE_NO_FAMILY"),
          direct_contact: cleanBool(report.direct_contact),
          info_source: oneOf(report.info_source, CHILD_INFO_SOURCE),
          info_source_detail: clean(report.info_source_detail, LIMITS.info_source_detail),
          notes: clean(report.notes, LIMITS.notes),
          photo_url, // PRIVADO en la vista pública (solo-nombre)
          latitude, longitude,
          dedup_key: fuzzyKey(name),
        },
      };
    }
    default:
      return err(`type desconocido: ${report.type}`);
  }
}

// Tablas válidas (para el upsert por lotes en la ruta).
export const INGEST_TABLES = ["checkins", "help_requests", "help_offers", "damaged_reports", "unaccompanied_children"];
