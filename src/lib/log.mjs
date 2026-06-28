// Logging estructurado para la superficie de servidor. Puro y testeable
// (`node --test`): sin dependencias de Next/Supabase, como `apiPolicy.mjs`. El
// objetivo es que NINGÚN fallo de servidor sea silencioso: cada `catch` y cada
// degradación (read vacío, fetch externo caído) deja una línea correlacionable.
//
// Contrato de salida: UNA línea JSON por evento → Vercel la parsea en campos
// consultables y cualquier alerta futura (Log Drain → Logflare/Sentry) filtra por
// `level`/`event`. NUNCA metemos PII: sólo error.message/name/code/digest + un
// `context` con claves en allow-list (event, scope, request_id, status, table…).
// Correlacionamos por `request_id`, jamás por el payload.

// ── Niveles ──────────────────────────────────────────────────────────────────
// error → console.error · warn → console.warn · info → console.log · debug →
// console.debug. `debug` está GATED: no-op salvo LOG_LEVEL=debug (o DEBUG truthy)
// para no meter ruido/costo en los logs de producción de Vercel.
const LEVEL_CONSOLE = {
  error: "error",
  warn: "warn",
  info: "log",
  debug: "debug",
};

function debugEnabled() {
  const level = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (level === "debug") return true;
  const dbg = process.env.DEBUG;
  return typeof dbg === "string" && dbg !== "" && dbg !== "0" && dbg !== "false";
}

// ── PII guard ────────────────────────────────────────────────────────────────
// Cualquier clave de `context` que parezca contacto/credencial/payload se
// descarta antes de serializar. Es una red de seguridad: el call-site NO debería
// pasar PII, pero si lo hace, no llega al log. Match por substring sobre la clave.
const DENYLIST_KEY_RE =
  /(phone|telefono|contact|contacto|email|correo|token|api[_-]?key|authorization|auth|password|clave|secret|body|payload|cookie|name|nombre|message|mensaje|direccion|address|ip|photo|foto)/i;

// `name`/`message` son legítimos en `serializeError` (campos del Error), pero como
// CLAVES de context casi siempre cargan PII (nombre de persona, mensaje libre), así
// que el denylist las corta. Los campos del error van por su propia ruta, no por context.
const MAX_STRING = 300;

/**
 * Filtra y acota un objeto de contexto para que sea seguro de loguear.
 * @param {Record<string, unknown>} [context]
 * @returns {Record<string, unknown>}
 */
export function sanitizeContext(context = {}) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (!context || typeof context !== "object") return out;
  for (const [key, value] of Object.entries(context)) {
    if (DENYLIST_KEY_RE.test(key)) continue;
    if (value == null) continue;
    if (typeof value === "string") {
      out[key] = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
    // objetos/arrays se omiten: evitan que una fila de Supabase entera caiga al log.
  }
  return out;
}

/**
 * Extrae sólo los campos no-PII de un error. Acepta cualquier cosa (un `catch`
 * puede recibir un no-Error) y nunca lanza.
 * @param {unknown} err
 * @returns {{ message?: string, name?: string, code?: string, digest?: string }}
 */
export function serializeError(err) {
  if (err == null) return {};
  if (typeof err === "string") return { message: err.slice(0, MAX_STRING) };
  if (typeof err !== "object") return { message: String(err).slice(0, MAX_STRING) };
  const e = /** @type {Record<string, unknown>} */ (err);
  /** @type {{ message?: string, name?: string, code?: string, digest?: string }} */
  const out = {};
  if (typeof e.message === "string") out.message = e.message.slice(0, MAX_STRING);
  if (typeof e.name === "string") out.name = e.name;
  // Supabase/Postgrest exponen `code`; React error boundary expone `digest`.
  if (typeof e.code === "string") out.code = e.code;
  else if (typeof e.code === "number") out.code = String(e.code);
  if (typeof e.digest === "string") out.digest = e.digest;
  return out;
}

/**
 * Construye la línea JSON. Puro y testeable: no toca consola ni reloj salvo `ts`.
 * @param {"error"|"warn"|"info"|"debug"} level
 * @param {string} event
 * @param {unknown} err  Error a serializar (sólo relevante para error/warn); pasa null si no hay.
 * @param {Record<string, unknown>} [context]
 * @returns {string}
 */
export function formatLine(level, event, err, context = {}) {
  const line = {
    level,
    event,
    ...serializeError(err),
    ...sanitizeContext(context),
    ts: new Date().toISOString(),
  };
  return JSON.stringify(line);
}

/**
 * @param {"error"|"warn"|"info"|"debug"} level
 * @param {string} event
 * @param {unknown} err
 * @param {Record<string, unknown>} context
 */
function emit(level, event, err, context) {
  const method = LEVEL_CONSOLE[level] ?? "log";
  console[method](formatLine(level, event, err, context));
}

/**
 * Falla de servidor con un error. Loguear ANTES de devolver la respuesta genérica.
 * @param {string} event
 * @param {unknown} err
 * @param {Record<string, unknown>} [context]
 */
export function logError(event, err, context = {}) {
  emit("error", event, err, context);
}

/**
 * Degradación controlada (read vacío, fetch externo caído, fallback). Puede o no
 * traer un error; pasa el error como segundo arg si lo hay.
 * @param {string} event
 * @param {Record<string, unknown>} [context]
 * @param {unknown} [err]
 */
export function logWarn(event, context = {}, err = null) {
  emit("warn", event, err, context);
}

/**
 * Evento de ciclo de vida de bajo volumen (NO por request). Sin error.
 * @param {string} event
 * @param {Record<string, unknown>} [context]
 */
export function logInfo(event, context = {}) {
  emit("info", event, null, context);
}

/**
 * Detalle de diagnóstico. No-op salvo LOG_LEVEL=debug (o DEBUG truthy).
 * @param {string} event
 * @param {Record<string, unknown>} [context]
 */
export function logDebug(event, context = {}) {
  if (!debugEnabled()) return;
  emit("debug", event, null, context);
}
