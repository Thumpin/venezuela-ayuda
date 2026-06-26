// Shared domain constants. Spanish labels live here so the whole UI stays
// consistent and translation is a single source of truth.
//
// The KEYS of the metadata objects below (categories/statuses/severities) are
// the canonical enum values — single-sourced in ./canonical.mjs and consumed by
// the non-TS ingest pipeline too. These objects keep their `as const` metadata
// (the UI needs the literal label/emoji/color types); the canonical arrays own
// the value list. scripts/canonical.test.mjs is the drift guard: it fails if any
// object's key set diverges from its canonical array. (A compile-time guard was
// tried but TS widens the JSDoc-`const` arrays inconsistently across sizes, so
// it gave false confidence — the runtime test is the honest mechanical check.)
// LIMITS below is derived directly (re-exported, not redefined).

import * as CANONICAL from "./canonical.mjs";

// `pin` = solid color used on the map. `tintBg`/`tintText` = the soft-tint badge
// style from the design system (calm, never saturated full-bleed).
export const CHECKIN_STATUSES = {
  SAFE: { label: "A salvo", emoji: "✅", pin: "#2f9e6e", tintBg: "#eaf3ec", tintText: "#1f7a52" },
  NEEDS_HELP: { label: "Necesita ayuda", emoji: "🆘", pin: "#e2603a", tintBg: "#fdf0e9", tintText: "#c05a32" },
  LOOKING_FOR_SOMEONE: { label: "En búsqueda", emoji: "🔎", pin: "#b5811f", tintBg: "#fff5e6", tintText: "#b5811f" },
} as const;
export type CheckinStatus = keyof typeof CHECKIN_STATUSES;

export const HELP_CATEGORIES = {
  medical: { label: "Médica", emoji: "🩺" },
  food: { label: "Comida", emoji: "🍞" },
  water: { label: "Agua", emoji: "💧" },
  shelter: { label: "Refugio", emoji: "🏠" },
  transportation: { label: "Transporte", emoji: "🚗" },
  electricity: { label: "Electricidad", emoji: "⚡" },
  rescue: { label: "Rescate", emoji: "🚨" },
  tools: { label: "Herramientas", emoji: "🛠️" },
} as const;
export type HelpCategory = keyof typeof HELP_CATEGORIES;

// Quick-pick list of tools/equipment commonly needed after an earthquake.
// Shown as chips in the help request form so people can add them fast.
export const COMMON_TOOLS = [
  "Taladro",
  "Casco",
  "Botas de trabajo",
  "Guantes",
  "Pala",
  "Pico",
  "Linterna",
  "Cuerda",
  "Generador",
  "Motosierra",
  "Carretilla",
  "Barra / palanca",
  "Mascarilla",
  "Gato hidráulico",
  "Escalera",
  "Botiquín",
] as const;

export const OFFER_CATEGORIES = {
  transportation: { label: "Transporte", emoji: "🚗" },
  food: { label: "Comida", emoji: "🍞" },
  shelter: { label: "Refugio", emoji: "🏠" },
  medical: { label: "Médica", emoji: "🩺" },
  supplies: { label: "Suministros", emoji: "📦" },
  translation: { label: "Traducción", emoji: "🗣️" },
} as const;
export type OfferCategory = keyof typeof OFFER_CATEGORIES;

// Which help-request categories each offer can fulfill (offer ↔ request
// categories don't overlap 1:1). `translation` is cross-cutting → empty = all.
export const OFFER_TO_HELP: Record<OfferCategory, HelpCategory[]> = {
  transportation: ["transportation", "rescue"],
  food: ["food", "water"],
  shelter: ["shelter"],
  medical: ["medical"],
  supplies: ["food", "water", "tools", "shelter", "electricity"],
  translation: [],
};

// Labels follow the design language (Normal / Importante / Urgente / Crítico);
// the DB enum keys (LOW/MEDIUM/HIGH/CRITICAL) are unchanged.
export const URGENCY_LEVELS = {
  LOW: { label: "Normal", color: "#5b6b7b", tintBg: "#f0f3f7", weight: 1 },
  MEDIUM: { label: "Importante", color: "#b5811f", tintBg: "#fff5e6", weight: 2 },
  HIGH: { label: "Urgente", color: "#e2603a", tintBg: "#fdf0e9", weight: 3 },
  CRITICAL: { label: "Crítico", color: "#c9483a", tintBg: "#fbe9e4", weight: 4 },
} as const;
export type UrgencyLevel = keyof typeof URGENCY_LEVELS;

// Severity levels for community damaged-building reports.
export const DAMAGE_SEVERITY = {
  CRACKS: { label: "Grietas", color: "#ca8a04", tintBg: "#fff5e6" },
  PARTIAL: { label: "Daño parcial", color: "#ea580c", tintBg: "#fdf0e9" },
  COLLAPSE_RISK: { label: "Riesgo de colapso", color: "#dc2626", tintBg: "#fbe9e4" },
  COLLAPSED: { label: "Colapso", color: "#7f1d1d", tintBg: "#f6dada" },
} as const;
export type DamageSeverity = keyof typeof DAMAGE_SEVERITY;

// Optional structural-risk questionnaire shown on the damaged-building form.
// A community orientation guide — NOT a professional inspection — so it never
// outputs a reassuring "safe/verde" result; the all-clear state is the neutral
// "Sin señales graves observadas". The risk logic lives in lib/risk.ts.
export const RISK_ANSWERS = [
  { value: "si", label: "Sí" },
  { value: "no", label: "No" },
  { value: "nose", label: "No sé" },
] as const;
export type RiskAnswer = (typeof RISK_ANSWERS)[number]["value"];

// Section 1 — severe signs. Any "Sí" ⇒ ROJO; any "No sé" ⇒ ≥ AMARILLO + priority.
export const RISK_QUESTIONS_SEVERE = [
  { id: "R1", text: "¿Alguna parte del edificio se cayó o se desprendió (techo, piso, escalera, balcón, pared, columna)?" },
  { id: "R2", text: "¿El edificio o algún piso se ve inclinado, torcido o ladeado; puertas/ventanas en diagonal; un lado más hundido?" },
  { id: "R3", text: "¿Las columnas que sostienen el edificio tienen grietas (no las paredes ni los frisos)?" },
  { id: "R4", text: "¿Alguna columna tiene grietas en X o diagonales, concreto reventado, o cabillas expuestas o dobladas?" },
  { id: "R5", text: "¿La planta baja se ve más dañada, aplastada o más baja que los pisos de arriba (piso blando)?" },
  { id: "R6", text: "¿Hay grietas grandes donde las columnas se unen con el techo o las vigas?" },
  { id: "R7", text: "¿Algún piso o techo se ve hundido, pandeado o caído, o ya no está a nivel?" },
  { id: "R8", text: "¿El edificio chocó con el vecino y quedó dañado en la unión, o se separó dejando una abertura?" },
  { id: "R9", text: "¿Hay grietas grandes en el suelo, hundimiento/levantamiento del terreno, o ladera con deslizamiento?" },
  { id: "R10", text: "¿Hay tanques de agua, paredes, parapetos, vidrios, fachada o balcones a punto de caerse?" },
] as const;

// Section 2 — minor signs. Evaluated only when no severe "Sí"; any "Sí"/"No sé" ⇒ AMARILLO.
export const RISK_QUESTIONS_MINOR = [
  { id: "A1", text: "¿Hay grietas solo en paredes, frisos o tabiques (no en columnas ni estructura)?" },
  { id: "A2", text: "¿Hay puertas o ventanas que antes abrían bien y ahora están trancadas?" },
  { id: "A3", text: "¿Se cayeron lámparas, frisos, cerámica, cornisas o cielo raso?" },
  { id: "A4", text: "¿Hay daños que no sabe si son graves, o no pudo ver bien las columnas y la estructura?" },
] as const;

// All questionnaire question ids (severe + minor), in display order.
export const RISK_QUESTION_IDS = [
  ...RISK_QUESTIONS_SEVERE.map((q) => q.id),
  ...RISK_QUESTIONS_MINOR.map((q) => q.id),
] as const;

// Traffic-light outcomes. `ctas` controls which call-to-action buttons show on
// the detail page. Never a green/"safe" result by design.
export const RISK_LEVELS = {
  ROJO: {
    color: "#dc2626",
    tintBg: "#fbe9e4",
    title: "Riesgo — Peligro",
    heading: "No entre ni permanezca en el edificio.",
    body: "Se detectaron señales de daño estructural grave. Salga de inmediato si está dentro y no vuelva a entrar, ni siquiera para sacar cosas. Aléjese también de la fachada y la acera por riesgo de caídas. Avise a sus vecinos. Reportamos este edificio para que un ingeniero lo revise.",
    ctas: ["ayuda"],
  },
  AMARILLO: {
    color: "#ca8a04",
    tintBg: "#fff5e6",
    title: "Riesgo — Precaución",
    heading: "No se confirmó que el edificio sea seguro.",
    body: "Hay daños o señales que requieren revisión. No use el edificio normalmente y evite las zonas dañadas mientras continúen las réplicas. Un ingeniero debe revisarlo antes de volver a habitarlo. Reportamos este edificio para revisión.",
    ctas: [],
  },
  NINGUNA: {
    color: "#5b6b7b",
    tintBg: "#f0f3f7",
    title: "Sin señales graves observadas",
    heading: "No se observaron señales graves, pero esto NO es una inspección.",
    body: "Una revisión rápida desde afuera puede no ver daños internos u ocultos. Mantenga precaución durante las réplicas. Solo un ingeniero puede confirmar que el edificio es seguro.",
    ctas: [],
  },
} as const;
export type RiskLevel = keyof typeof RISK_LEVELS;

// Permanent disclaimer shown under every questionnaire result.
export const RISK_DISCLAIMER =
  "Esta herramienta es una guía comunitaria de orientación, no una inspección profesional y no garantiza la seguridad de ningún edificio. Ante la duda, no entre. La decisión final corresponde a un ingeniero estructural.";

// Shown when a missing-person check-in has been resolved (found_at set).
export const FOUND_BADGE = {
  label: "Encontrado/a",
  emoji: "✅",
  tintBg: "#eaf3ec",
  tintText: "#1f7a52",
} as const;

export const REQUEST_STATUSES = {
  OPEN: { label: "Abierta", color: "#dc2626" },
  IN_PROGRESS: { label: "En proceso", color: "#ca8a04" },
  RESOLVED: { label: "Resuelta", color: "#16a34a" },
} as const;
export type RequestStatus = keyof typeof REQUEST_STATUSES;

// Brand palette (design system). Calm, trustworthy, community — not alarmist.
export const BRAND = {
  ink: "#14212e",
  inkSoft: "#5b6b7b",
  surface: "#f5f8fb",
  line: "#e6ecf2",
  action: "#2563a8", // primary / trust
  emergency: "#e2603a", // help requests
  safe: "#2f9e6e", // safe / success
  critical: "#c9483a",
  whatsapp: "#25D366",
} as const;

// Map default view: roughly centered on Venezuela.
export const VENEZUELA_CENTER = { lng: -66.9, lat: 10.0 };
export const DEFAULT_ZOOM = 6;

// Input limits — keep payloads small for slow connections and cap abuse.
// Single-sourced in ./canonical.mjs so the TS UI and the non-TS ingest pipeline
// clamp identically. Re-exported (not redefined) to avoid drift.
export const LIMITS = CANONICAL.LIMITS;
