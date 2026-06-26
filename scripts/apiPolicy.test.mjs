// Concerns HTTP de la superficie pública del API: enforcement de Content-Type,
// request-id (tracing + anti log-injection), shape de error sin leak, y los mapas
// de headers declarativos (security + CORS) que consume next.config.
// Corre: node --test scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requireJsonContentType,
  resolveRequestId,
  errorBody,
  safeDbError,
  DB_WRITE_FAILED_MESSAGE,
  SECURITY_HEADERS,
  API_SECURITY_HEADERS,
  API_CORS_HEADERS,
} from "../src/lib/apiPolicy.mjs";

// ── Content-Type enforcement (POST/PATCH → 415 si no es JSON) ────────────────
test("requireJsonContentType: acepta application/json con/sin charset, case-insensitive", () => {
  assert.equal(requireJsonContentType("application/json"), true);
  assert.equal(requireJsonContentType("application/json; charset=utf-8"), true);
  assert.equal(requireJsonContentType("APPLICATION/JSON"), true);
  assert.equal(requireJsonContentType("  application/json  "), true);
});

test("requireJsonContentType: rechaza ausente, vacío y otros tipos", () => {
  assert.equal(requireJsonContentType(null), false);
  assert.equal(requireJsonContentType(""), false);
  assert.equal(requireJsonContentType("text/plain"), false);
  assert.equal(requireJsonContentType("application/xml"), false);
  assert.equal(requireJsonContentType("multipart/form-data; boundary=x"), false);
  // No aceptar un substring tramposo.
  assert.equal(requireJsonContentType("text/json-evil"), false);
});

// ── Request ID (tracing + anti log/header-injection) ─────────────────────────
test("resolveRequestId: honra un trace id entrante seguro", () => {
  const gen = () => "GENERATED";
  assert.equal(resolveRequestId("550e8400-e29b-41d4-a716-446655440000", gen), "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(resolveRequestId("trace-abc_123.45", gen), "trace-abc_123.45");
});

test("resolveRequestId: genera uno propio si falta o es inseguro", () => {
  const gen = () => "GENERATED";
  assert.equal(resolveRequestId(null, gen), "GENERATED");
  assert.equal(resolveRequestId("", gen), "GENERATED");
  assert.equal(resolveRequestId("short", gen), "GENERATED"); // < 8 chars
  // CRLF / control chars → header & log injection; jamás se honran.
  assert.equal(resolveRequestId("abc\r\nSet-Cookie: x=1", gen), "GENERATED");
  assert.equal(resolveRequestId("has spaces here", gen), "GENERATED");
  assert.equal(resolveRequestId("x".repeat(300), gen), "GENERATED"); // demasiado largo
});

test("resolveRequestId: usa crypto.randomUUID por default (sin inyectar gen)", () => {
  const id = resolveRequestId(null);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

// ── Shape de error consistente + sin leak de internals ───────────────────────
test("errorBody: shape { error } y request_id opcional", () => {
  assert.deepEqual(errorBody("boom"), { error: "boom" });
  assert.deepEqual(errorBody("boom", "rid-123"), { error: "boom", request_id: "rid-123" });
  assert.deepEqual(errorBody("boom", null), { error: "boom" });
});

test("safeDbError: NUNCA refleja el mensaje crudo de Postgres", () => {
  const raw = { message: 'duplicate key value violates unique constraint "checkins_pkey"', code: "23505" };
  const out = safeDbError(raw);
  assert.equal(out, DB_WRITE_FAILED_MESSAGE);
  assert.ok(!out.includes("constraint"));
  assert.ok(!out.includes("duplicate"));
  assert.ok(!out.includes("23505"));
  // También para strings sueltos o null.
  assert.equal(safeDbError("relation \"x\" does not exist"), DB_WRITE_FAILED_MESSAGE);
  assert.equal(safeDbError(null), DB_WRITE_FAILED_MESSAGE);
});

// ── CORS declarativo (next.config → /api/v1/*; el browser hace el split) ──────
test("API_CORS_HEADERS: lectura `*`, y writes bloqueados por el browser (sin POST/PATCH ni x-api-key)", () => {
  const k = Object.fromEntries(API_CORS_HEADERS.map((h) => [h.key, h.value]));
  // GET cross-origin (simple request) puede leer.
  assert.equal(k["Access-Control-Allow-Origin"], "*");
  // El preflight de un write falla: ni el método ni el header de la key están permitidos.
  assert.equal(k["Access-Control-Allow-Methods"], "GET, OPTIONS");
  assert.ok(!k["Access-Control-Allow-Methods"].includes("POST"));
  assert.ok(!k["Access-Control-Allow-Methods"].includes("PATCH"));
  const allowHeaders = k["Access-Control-Allow-Headers"].toLowerCase();
  assert.ok(allowHeaders.includes("content-type"));
  assert.ok(!allowHeaders.includes("x-api-key")); // una key nunca se permite desde un browser
});

// ── Security headers (cableados en next.config) ──────────────────────────────
test("SECURITY_HEADERS: cubre lo que Vercel NO pone solo", () => {
  const k = Object.fromEntries(SECURITY_HEADERS.map((h) => [h.key, h.value]));
  assert.equal(k["X-Content-Type-Options"], "nosniff"); // Vercel NO lo pone auto
  assert.ok(k["Strict-Transport-Security"].includes("includeSubDomains")); // refuerza el base de Vercel
  assert.ok("Referrer-Policy" in k);
  assert.ok("X-Frame-Options" in k);
});

test("API_SECURITY_HEADERS: el API no necesita features de browser → lockdown", () => {
  const k = Object.fromEntries(API_SECURITY_HEADERS.map((h) => [h.key, h.value]));
  assert.ok("Permissions-Policy" in k);
  assert.ok(k["Permissions-Policy"].includes("geolocation=()"));
});
