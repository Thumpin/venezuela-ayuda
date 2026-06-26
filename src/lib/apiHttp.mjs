// Concerns HTTP transversales de la superficie pública del API (v1). Puro y
// testeable (`node --test`): sin dependencias de Next/Supabase. Las rutas sólo
// cablean estas decisiones; toda la lógica vive y se prueba aquí.

import { randomUUID } from "node:crypto";

// ── Content-Type enforcement ─────────────────────────────────────────────────
// POST/PATCH deben declarar JSON. Sin esto, un cliente puede mandar form-data o
// text/plain y forzar parseos ambiguos. → 415 si esto da false.
export function requireJsonContentType(header) {
  if (typeof header !== "string") return false;
  // Sólo el media type (antes del `;` de parámetros como charset), trim + lower.
  const mediaType = header.split(";")[0].trim().toLowerCase();
  return mediaType === "application/json";
}

// ── Request ID (tracing + audit_log.request_id) ──────────────────────────────
// Un trace id entrante (x-request-id) sólo se honra si es SEGURO: token acotado
// sin CRLF ni espacios → cierra header-injection (eco en la respuesta) y
// log-injection (va al audit_log). Si falta o es inseguro, generamos uno propio.
const SAFE_TRACE_ID_RE = /^[A-Za-z0-9._-]{8,200}$/;

export function resolveRequestId(incoming, gen = randomUUID) {
  if (typeof incoming === "string" && SAFE_TRACE_ID_RE.test(incoming)) return incoming;
  return gen();
}

// ── Shape de error consistente + sin leak ────────────────────────────────────
export const SERVICE_UNAVAILABLE_MESSAGE = "Servicio no disponible.";
export const DB_WRITE_FAILED_MESSAGE = "No se pudo guardar el reporte.";

// Todo error del API responde con este shape. request_id se añade si lo tenemos
// (correlación con logs/audit). NUNCA se mete el mensaje crudo de un error de DB.
/**
 * @param {string} message
 * @param {string | null} [requestId]
 * @returns {{ error: string, request_id?: string }}
 */
export function errorBody(message, requestId = null) {
  return requestId ? { error: message, request_id: requestId } : { error: message };
}

// Colapsa CUALQUIER error de escritura de DB a un mensaje genérico. El mensaje
// crudo de Postgres (nombres de constraint/tabla, SQLSTATE, fragmentos de query)
// jamás llega al cliente. Acepta (e ignora) el error crudo para que el call-site
// documente qué se está colapsando.
/**
 * @param {unknown} [rawErr]
 * @returns {string}
 */
export function safeDbError(rawErr) {
  void rawErr;
  return DB_WRITE_FAILED_MESSAGE;
}

// ── CORS por tipo de endpoint ────────────────────────────────────────────────
// LECTURA (GET, abierta, dato público sin PII ni credenciales): `*` es correcto y
// estándar — cualquier sitio socio puede consumirla desde el browser.
//
// ESCRITURA (POST/PATCH, key-gated, server-to-server): SIN CORS a propósito. Una
// API key no debe vivir en un browser; al no emitir Access-Control-Allow-* el
// preflight cross-origin del browser falla → el patrón inseguro queda bloqueado.
export function corsReadHeaders() {
  return { "Access-Control-Allow-Origin": "*" };
}

// Preflight (OPTIONS) de las rutas de lectura. Sólo anuncia GET/OPTIONS: aunque
// /reports y /reports/{id} también exponen POST/PATCH, esos NO se anuncian aquí,
// así un browser nunca obtiene permiso de preflight para escribir cross-origin.
export function readPreflightHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// ── Security headers (cableados en next.config `headers()`) ───────────────────
// Sólo lo que Vercel NO pone solo (ver investigación de plataforma):
//   - HTTPS redirect (308) y HSTS base: los pone Vercel. Reforzamos HSTS con
//     includeSubDomains/preload en el dominio propio (Vercel sólo da max-age).
//   - X-Content-Type-Options: Vercel NO lo pone → lo seteamos.
//   - X-Frame-Options / Referrer-Policy: tampoco → los seteamos.
// Globales y seguros también para el sitio HTML (no rompen maps/GA).
export const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

// Extra SÓLO para /api/*: el API no usa ninguna feature de browser, así que se
// apagan todas (no se aplica al sitio para no romper el geolocation del picker).
export const API_SECURITY_HEADERS = [
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];
