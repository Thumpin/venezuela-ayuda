// Guard de drift: las CLAVES de los objetos de metadata de src/lib/constants.ts
// deben ser EXACTAMENTE los arrays canónicos de src/lib/canonical.mjs (mismo
// set, mismo orden), y LIMITS debe re-exportar el canónico. constants.ts es TS
// y no se puede importar bajo `node --test`, así que parseamos su fuente y
// extraemos las claves de cada objeto `as const`. El gemelo a nivel de tipos
// (AssertSameKeys en constants.ts) lo cubre en `tsc --noEmit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  HELP_CATEGORIES,
  OFFER_CATEGORIES,
  URGENCY,
  SEVERITY,
  CHECKIN_STATUS,
  REQUEST_STATUS,
  LIMITS,
} from "../src/lib/canonical.mjs";

const SRC = readFileSync(
  fileURLToPath(new URL("../src/lib/constants.ts", import.meta.url)),
  "utf8"
);

// Extrae las claves de primer nivel del objeto `export const NAME = { ... }`.
// Asume un objeto de un nivel (clave: { ...metadata }) como los del archivo.
function objectKeys(name) {
  const start = SRC.indexOf(`export const ${name} = {`);
  assert.notEqual(start, -1, `no se encontró ${name} en constants.ts`);
  const open = SRC.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assert.notEqual(end, -1, `objeto ${name} sin cierre`);
  const body = SRC.slice(open + 1, end);
  const keys = [];
  let inner = 0;
  for (const line of body.split("\n")) {
    for (const ch of line) {
      if (ch === "{") inner++;
      else if (ch === "}") inner--;
    }
    if (inner !== 0) continue; // saltar líneas dentro de la metadata anidada
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

const PAIRS = [
  ["CHECKIN_STATUSES", CHECKIN_STATUS],
  ["HELP_CATEGORIES", HELP_CATEGORIES],
  ["OFFER_CATEGORIES", OFFER_CATEGORIES],
  ["URGENCY_LEVELS", URGENCY],
  ["DAMAGE_SEVERITY", SEVERITY],
  ["REQUEST_STATUSES", REQUEST_STATUS],
];

for (const [objName, canonicalArr] of PAIRS) {
  test(`${objName} claves === canónico`, () => {
    assert.deepEqual(objectKeys(objName), [...canonicalArr]);
  });
}

test("constants.ts re-exporta LIMITS (no lo redefine)", () => {
  assert.match(SRC, /export const LIMITS = CANONICAL\.LIMITS;/);
  // Sanity: el canónico cubre los campos que la UI y la ingesta esperan.
  for (const k of ["name", "city", "message", "description", "phone", "availability", "place_name", "itemName", "maxItems", "maxQty", "source_url", "photo_url"]) {
    assert.equal(typeof LIMITS[k], "number", `LIMITS.${k} faltante`);
  }
});

test("ingest.mjs consume los enums/LIMITS del canónico", async () => {
  const ingestSrc = readFileSync(
    fileURLToPath(new URL("../src/lib/ingest.mjs", import.meta.url)),
    "utf8"
  );
  assert.match(ingestSrc, /from "\.\/canonical\.mjs"/);
  // No debe re-declarar los enums localmente.
  assert.doesNotMatch(ingestSrc, /const HELP_CATEGORIES =/);
  assert.doesNotMatch(ingestSrc, /const LIMITS =/);
});
