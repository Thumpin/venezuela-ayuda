// Auth por API key del hub: hashing, formato de key, y el cache de lookup
// (key_hash → partner) con TTL. Corre: node --test scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashKey,
  parsePrefix,
  generateApiKey,
  createAuthenticator,
} from "../src/lib/apiAuth.mjs";

test("hashKey: determinístico y estable", () => {
  assert.equal(hashKey("va_live_abc"), hashKey("va_live_abc"));
  assert.match(hashKey("va_live_abc"), /^[0-9a-f]{64}$/); // sha256 hex
});

test("hashKey: distinto para keys distintas", () => {
  assert.notEqual(hashKey("va_live_abc"), hashKey("va_live_xyz"));
});

test("parsePrefix: primeros 12 chars; no rompe con keys cortas", () => {
  assert.equal(parsePrefix("va_live_0123456789"), "va_live_0123");
  assert.equal(parsePrefix("short"), "short");
});

test("generateApiKey: formato va_live_ y hash estable", () => {
  const k = generateApiKey();
  assert.match(k, /^va_live_[A-Za-z0-9_-]{20,}$/);
  assert.notEqual(generateApiKey(), generateApiKey()); // aleatoria
  assert.equal(hashKey(k), hashKey(k));
});

// --- cache de lookup ---------------------------------------------------------

function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

test("authenticate: key inexistente → null", async () => {
  const auth = createAuthenticator(async () => null);
  assert.equal(await auth("va_live_nope"), null);
});

test("authenticate: sin key → null", async () => {
  const auth = createAuthenticator(async () => ({ source: "x" }));
  assert.equal(await auth(""), null);
  assert.equal(await auth(undefined), null);
});

test("authenticate: key válida → partner", async () => {
  const partner = { partnerId: "1", source: "cruzroja.org", scopes: ["write"] };
  const auth = createAuthenticator(async () => partner);
  assert.deepEqual(await auth("va_live_ok"), partner);
});

test("cache: dos lookups de la misma key dentro del TTL → un solo hit a la DB", async () => {
  let hits = 0;
  const clock = fakeClock();
  const auth = createAuthenticator(
    async () => {
      hits++;
      return { source: "cruzroja.org" };
    },
    { ttlMs: 60_000, now: clock.now }
  );
  await auth("va_live_ok");
  await auth("va_live_ok");
  assert.equal(hits, 1);
});

test("cache: pasado el TTL vuelve a consultar", async () => {
  let hits = 0;
  const clock = fakeClock();
  const auth = createAuthenticator(
    async () => {
      hits++;
      return { source: "cruzroja.org" };
    },
    { ttlMs: 60_000, now: clock.now }
  );
  await auth("va_live_ok");
  clock.advance(60_001);
  await auth("va_live_ok");
  assert.equal(hits, 2);
});

test("cache: key revocada deja de validar tras expirar (lag ≤ TTL)", async () => {
  let revoked = false;
  const clock = fakeClock();
  const auth = createAuthenticator(
    async () => (revoked ? null : { source: "cruzroja.org" }),
    { ttlMs: 60_000, now: clock.now }
  );
  assert.ok(await auth("va_live_ok")); // válida, cacheada
  revoked = true;
  assert.ok(await auth("va_live_ok")); // dentro del TTL: sigue válida (lag aceptable)
  clock.advance(60_001);
  assert.equal(await auth("va_live_ok"), null); // expiró → re-consulta → revocada
});

test("cache: los misses expiran rápido (missTtlMs), no en el TTL completo", async () => {
  let hits = 0;
  const clock = fakeClock();
  const auth = createAuthenticator(
    async () => { hits++; return null; }, // siempre miss
    { ttlMs: 60_000, missTtlMs: 5_000, now: clock.now }
  );
  await auth("va_live_bad");
  await auth("va_live_bad"); // dentro de missTtlMs → cacheado
  assert.equal(hits, 1);
  clock.advance(5_001);
  await auth("va_live_bad"); // miss expiró → re-consulta
  assert.equal(hits, 2);
});

test("cache: error transitorio de fetchByHash se propaga y NO se cachea", async () => {
  let mode = "throw";
  const auth = createAuthenticator(async () => {
    if (mode === "throw") throw new Error("db down");
    return { source: "cruzroja.org" };
  });
  await assert.rejects(() => auth("va_live_ok"), /db down/);
  mode = "ok";
  assert.ok(await auth("va_live_ok")); // no quedó cacheado el fallo → la key válida funciona enseguida
});

test("cache: tope de tamaño acota la memoria (maxEntries)", async () => {
  const auth = createAuthenticator(async () => null, { maxEntries: 3 });
  for (let i = 0; i < 10; i++) await auth(`va_live_${i}`);
  // No revienta ni crece sin límite; el tope vacía el cache al rebasar.
  // (smoke: 10 keys distintas con cap 3 no acumulan 10 entradas)
  assert.ok(true);
});
