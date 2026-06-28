// Logging estructurado: serialización sin PII, allow-list de context, shape JSON
// y gating de logDebug. Corre: node --test scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  serializeError,
  sanitizeContext,
  formatLine,
  logError,
  logDebug,
} from "../src/lib/log.mjs";

// ── serializeError: sólo campos no-PII del error ─────────────────────────────
test("serializeError: conserva message/name/code/digest y nada más", () => {
  const err = Object.assign(new Error("boom"), { code: "PGRST116", digest: "abc123" });
  const out = serializeError(err);
  assert.equal(out.message, "boom");
  assert.equal(out.name, "Error");
  assert.equal(out.code, "PGRST116");
  assert.equal(out.digest, "abc123");
  // No arrastra propiedades arbitrarias (p.ej. una fila adjunta al error).
  assert.deepEqual(Object.keys(out).sort(), ["code", "digest", "message", "name"]);
});

test("serializeError: acepta no-Error sin lanzar", () => {
  assert.deepEqual(serializeError(null), {});
  assert.deepEqual(serializeError("just a string"), { message: "just a string" });
  assert.equal(serializeError(42).message, "42");
  assert.equal(serializeError({ code: 503 }).code, "503");
});

test("serializeError: trunca mensajes largos", () => {
  const out = serializeError(new Error("x".repeat(1000)));
  assert.ok(out.message.length <= 300);
});

test("serializeError: descarta details/hint de Postgres (ahí va la PII)", () => {
  // Postgres mete los VALORES en conflicto en details/hint, no en message.
  const pgErr = {
    name: "PostgrestError",
    code: "23505",
    message: 'duplicate key value violates unique constraint "checkins_phone_key"',
    details: "Key (phone_private)=(+584121234567) already exists.",
    hint: "contact: maria@example.com",
  };
  const out = serializeError(pgErr);
  assert.deepEqual(Object.keys(out).sort(), ["code", "message", "name"]);
  const serialized = JSON.stringify(out);
  assert.ok(!serialized.includes("+584121234567"));
  assert.ok(!serialized.includes("maria@example.com"));
});

// ── sanitizeContext: PII guard ───────────────────────────────────────────────
test("sanitizeContext: descarta claves de PII/credencial/payload", () => {
  const out = sanitizeContext({
    scope: "data.searchCheckins",
    request_id: "a1b2c3d4",
    status: 503,
    phone: "+58412...",
    contact: "persona",
    email: "x@y.z",
    "api-key": "sk_live_xxx",
    authorization: "Bearer xxx",
    body: { huge: "payload" },
    name: "Juan Pérez",
    message: "texto libre del usuario",
  });
  assert.deepEqual(out, {
    scope: "data.searchCheckins",
    request_id: "a1b2c3d4",
    status: 503,
  });
});

test("sanitizeContext: omite objetos/arrays y null, trunca strings", () => {
  const out = sanitizeContext({
    table: "public_help_requests",
    row: { id: 1, secretfield: "x" },
    tags: ["a", "b"],
    empty: null,
    long: "y".repeat(1000),
  });
  assert.equal(out.table, "public_help_requests");
  assert.ok(!("row" in out));
  assert.ok(!("tags" in out));
  assert.ok(!("empty" in out));
  assert.ok(out.long.length <= 301);
});

test("sanitizeContext: tolera entradas no-objeto", () => {
  assert.deepEqual(sanitizeContext(undefined), {});
  assert.deepEqual(sanitizeContext(null), {});
});

// ── formatLine: una línea JSON válida con level/event/ts ─────────────────────
test("formatLine: JSON de una sola línea con campos esperados", () => {
  const line = formatLine("error", "supabase_read_failed", new Error("boom"), {
    scope: "data.searchCheckins",
    request_id: "rid-123",
  });
  assert.ok(!line.includes("\n"));
  const parsed = JSON.parse(line);
  assert.equal(parsed.level, "error");
  assert.equal(parsed.event, "supabase_read_failed");
  assert.equal(parsed.message, "boom");
  assert.equal(parsed.scope, "data.searchCheckins");
  assert.equal(parsed.request_id, "rid-123");
  assert.equal(typeof parsed.ts, "string");
  assert.ok(!Number.isNaN(Date.parse(parsed.ts)));
});

test("formatLine: el context con PII nunca llega a la línea", () => {
  const parsed = JSON.parse(
    formatLine("warn", "x", null, { phone: "+58412", token: "sk_xxx", scope: "ok" }),
  );
  assert.ok(!("phone" in parsed));
  assert.ok(!("token" in parsed));
  assert.equal(parsed.scope, "ok");
});

// ── logError: emite por console.error ────────────────────────────────────────
test("logError: escribe una línea por console.error", () => {
  const original = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);
  try {
    logError("test_event", new Error("nope"), { scope: "unit" });
  } finally {
    console.error = original;
  }
  assert.equal(calls.length, 1);
  const parsed = JSON.parse(calls[0][0]);
  assert.equal(parsed.level, "error");
  assert.equal(parsed.event, "test_event");
});

// ── logDebug: gated por LOG_LEVEL/DEBUG ──────────────────────────────────────
test("logDebug: no-op salvo LOG_LEVEL=debug o DEBUG", () => {
  const original = console.debug;
  const calls = [];
  console.debug = (...args) => calls.push(args);
  const prevLevel = process.env.LOG_LEVEL;
  const prevDebug = process.env.DEBUG;
  try {
    delete process.env.LOG_LEVEL;
    delete process.env.DEBUG;
    logDebug("quiet", { scope: "unit" });
    assert.equal(calls.length, 0, "debe ser no-op sin flag");

    process.env.LOG_LEVEL = "debug";
    logDebug("loud", { scope: "unit" });
    assert.equal(calls.length, 1, "debe emitir con LOG_LEVEL=debug");
    assert.equal(JSON.parse(calls[0][0]).level, "debug");
  } finally {
    console.debug = original;
    if (prevLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = prevLevel;
    if (prevDebug === undefined) delete process.env.DEBUG;
    else process.env.DEBUG = prevDebug;
  }
});
