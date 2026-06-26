// Lógica de modificación parcial (PATCH /api/v1/reports/{id}). Puro y testeable
// (`node --test`): valida un patch contra el esquema del `type` correcto, rechaza
// campos inmutables/no-modificables, clampa texto y mapea `contact`→columna
// privada. Devuelve { ok, table, patch } | { ok:false, error }.
//
// Espeja la validación de ingest.mjs (reusa clean/isAvailable/VE y los enums de
// canonical.mjs), con UNA diferencia deliberada de semántica: el ingest CLAMPA
// valores inválidos a un default (un push masivo no debe abortar por un dato
// laxo); el PATCH los RECHAZA (una edición explícita con un enum/coord inválido
// es un error del cliente, no algo que adivinar). El `source`/`external_id`/`id`
// son inmutables — el creador original se preserva; el editor solo queda en el
// audit log.

import { clean, isAvailable, VE } from "./ingest.mjs";
import { TABLE_FOR_TYPE } from "./reports.mjs";
import {
  HELP_CATEGORIES,
  OFFER_CATEGORIES,
  URGENCY,
  SEVERITY,
  CHECKIN_STATUS,
  REQUEST_STATUS,
  LIMITS,
} from "./canonical.mjs";

// Nunca editables vía PATCH: identidad estable + atribución de origen.
export const IMMUTABLE_FIELDS = ["id", "source", "external_id"];

const RISK_LEVELS = ["ROJO", "AMARILLO", "NINGUNA"];

// Spec de campos mutables por TABLA. `kind` define la validación; `column` (si
// difiere del nombre del campo) es la columna real (p.ej. contact→phone_private
// en checkins). `required` = columna NOT NULL → no se puede vaciar.
const SPECS = {
  checkins: {
    name: { kind: "text", max: LIMITS.name, required: true },
    status: { kind: "enum", values: CHECKIN_STATUS, required: true },
    city: { kind: "text", max: LIMITS.city },
    message: { kind: "text", max: LIMITS.message },
    place_name: { kind: "text", max: LIMITS.place_name },
    photo_url: { kind: "text", max: LIMITS.photo_url },
    found_at: { kind: "date" },
    contact: { kind: "text", max: LIMITS.phone, column: "phone_private" },
    latitude: { kind: "coord" },
    longitude: { kind: "coord" },
  },
  help_requests: {
    category: { kind: "enum", values: HELP_CATEGORIES, required: true },
    description: { kind: "text", max: LIMITS.description, required: true },
    urgency: { kind: "enum", values: URGENCY, required: true },
    status: { kind: "enum", values: REQUEST_STATUS, required: true },
    city: { kind: "text", max: LIMITS.city },
    place_name: { kind: "text", max: LIMITS.place_name },
    contact: { kind: "text", max: LIMITS.phone },
    latitude: { kind: "coord" },
    longitude: { kind: "coord" },
  },
  help_offers: {
    category: { kind: "enum", values: OFFER_CATEGORIES, required: true },
    description: { kind: "text", max: LIMITS.description },
    availability: { kind: "text", max: LIMITS.availability },
    available: { kind: "bool", required: true },
    city: { kind: "text", max: LIMITS.city },
    contact: { kind: "text", max: LIMITS.phone },
    latitude: { kind: "coord" },
    longitude: { kind: "coord" },
  },
  damaged_reports: {
    place_name: { kind: "text", max: LIMITS.place_name, required: true },
    description: { kind: "text", max: LIMITS.description },
    severity: { kind: "enum", values: SEVERITY, required: true },
    status: { kind: "enum", values: REQUEST_STATUS, required: true },
    city: { kind: "text", max: LIMITS.city },
    photo_url: { kind: "text", max: LIMITS.photo_url },
    contact: { kind: "text", max: LIMITS.phone },
    risk_level: { kind: "enum", values: RISK_LEVELS },
    risk_priority: { kind: "bool" },
    latitude: { kind: "coord" },
    longitude: { kind: "coord" },
  },
};

// Catálogo público de campos mutables por TYPE (nombres de cara al cliente, no
// columnas crudas → expone `contact`, nunca `phone_private`/`manage_token`).
export const MUTABLE_FIELDS = Object.fromEntries(
  Object.keys(TABLE_FOR_TYPE).map((type) => [type, Object.keys(SPECS[TABLE_FOR_TYPE[type]])])
);

const err = (m) => ({ ok: false, error: m });

// (type wire, body) → { ok:true, table, patch } | { ok:false, error }.
export function buildPatch(type, body) {
  const table = TABLE_FOR_TYPE[type];
  if (!table) return err(`type desconocido: ${type}`);
  if (!body || typeof body !== "object" || Array.isArray(body)) return err("patch inválido");

  const spec = SPECS[table];
  const patch = {};
  let hasLat = false;
  let hasLng = false;
  let lat = null;
  let lng = null;

  for (const key of Object.keys(body)) {
    if (key === "type") continue; // discriminador, ya consumido
    if (IMMUTABLE_FIELDS.includes(key)) return err(`campo inmutable: ${key}`);
    const field = spec[key];
    if (!field) return err(`campo no modificable: ${key}`);

    const raw = body[key];
    switch (field.kind) {
      case "text": {
        const v = clean(raw, field.max);
        if (field.required && v === null) return err(`campo requerido no puede vaciarse: ${key}`);
        patch[field.column ?? key] = v;
        break;
      }
      case "enum": {
        if (!field.values.includes(raw)) return err(`valor inválido para ${key}`);
        patch[key] = raw;
        break;
      }
      case "bool": {
        patch[key] = isAvailable(raw); // misma coerción laxa que ingest (false/"false"/0/"no")
        break;
      }
      case "date": {
        if (typeof raw !== "string" || Number.isNaN(Date.parse(raw))) return err(`fecha inválida para ${key}`);
        patch[key] = raw;
        break;
      }
      case "coord": {
        const n = Number(raw);
        if (!Number.isFinite(n)) return err(`coordenada inválida para ${key}`);
        if (key === "latitude") { hasLat = true; lat = n; }
        else { hasLng = true; lng = n; }
        break;
      }
      default:
        return err(`campo no modificable: ${key}`);
    }
  }

  // Coords: ambas o ninguna, dentro del bounding box VE. El PATCH rechaza fuera
  // de rango (no clampa a null como ingest) — una edición explícita inválida es
  // un 400, no un borrado silencioso.
  if (hasLat || hasLng) {
    if (!(hasLat && hasLng)) return err("latitude y longitude deben actualizarse juntas");
    if (lat < VE.minLat || lat > VE.maxLat || lng < VE.minLng || lng > VE.maxLng) {
      return err("coordenadas fuera del bounding box de Venezuela");
    }
    patch.latitude = lat;
    patch.longitude = lng;
  }

  if (Object.keys(patch).length === 0) return err("patch sin campos modificables");
  return { ok: true, table, patch };
}
