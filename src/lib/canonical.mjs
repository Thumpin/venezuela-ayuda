// Única fuente de verdad para los valores canónicos del dominio: enums de
// categorías/estados y límites de longitud de inputs. JS puro, sin deps, para
// que lo importen tanto el TS (vía allowJs) como los tests de `node --test`.
//
// constants.ts mantiene objetos de metadata (labels/emojis/colores de UI) cuyas
// CLAVES deben ser exactamente estos arrays, y re-exporta LIMITS desde acá;
// ingest.mjs consume estos arrays directo. No dupliques estas listas en ningún
// otro lado — agregá un valor acá y todo lo demás lo hereda. El test de paridad
// (scripts/canonical.test.mjs) falla si las claves de constants.ts divergen.

// Identidad de NUESTRA propia plataforma como socio del hub. La escritura interna
// del sitio (server actions) pasa por las MISMAS RPC que el API externo, atribuida
// a este socio → toda mutación (interna o externa) queda auditada y atribuida
// uniformemente. El id es FIJO y conocido: idéntico acá y en el seed de la
// migración 0015 (`api_partners`), para que el partner_id no dependa de leer la DB.
// VA_SOURCE es el `source` que ya estampan por DEFAULT las 4 tablas de reporte.
export const VA_PARTNER_ID = "11111111-1111-4111-8111-111111111111";
export const VA_SOURCE = "venezuela-ayuda.com";

export const HELP_CATEGORIES = ["medical", "food", "water", "shelter", "transportation", "electricity", "rescue", "tools"];
export const OFFER_CATEGORIES = ["transportation", "food", "shelter", "medical", "supplies", "translation"];
export const URGENCY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const SEVERITY = ["CRACKS", "PARTIAL", "COLLAPSE_RISK", "COLLAPSED"];
export const CHECKIN_STATUS = ["SAFE", "NEEDS_HELP", "LOOKING_FOR_SOMEONE"];
export const REQUEST_STATUS = ["OPEN", "IN_PROGRESS", "RESOLVED"];

// Registro de niños no acompañados (issue #47). Valores tomados 1:1 de las
// opciones del formulario "Infancia Protegida Vzla — Registro" y espejados en el
// enum de la migración 0021 (child_status / child_gender / child_info_source).
export const CHILD_STATUS = [
  "ALONE_NO_FAMILY",
  "ACCOMPANIED_SEEKING_FAMILY",
  "IN_SHELTER",
  "IN_HOSPITAL",
  "REUNITED",
  "WITH_NON_FAMILY",
];
export const CHILD_GENDER = ["BOY", "GIRL", "UNSPECIFIED"];
export const CHILD_INFO_SOURCE = ["SOCIAL_MEDIA", "FRIEND_FAMILY", "INSTITUTION", "EXISTING_LIST", "OTHER"];

// Límites de longitud de inputs. Unión de los campos que necesitan el TS (UI:
// itemName/maxItems/maxQty) y la ingesta (source_url/photo_url). Mantener acá
// para que clamp y validación nunca diverjan.
export const LIMITS = {
  name: 80,
  city: 80,
  message: 500,
  description: 800,
  phone: 30,
  availability: 200,
  place_name: 120,
  source_url: 500,
  photo_url: 500,
  itemName: 40,
  maxItems: 25,
  maxQty: 999,
  // Registro de niños no acompañados (issue #47).
  age: 40,
  found_place: 200,
  last_seen_place: 200,
  hospital: 120,
  info_source_detail: 200,
  notes: 800,
};
