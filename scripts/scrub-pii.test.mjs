// Tests for the PII scrubber (scrub-pii.mjs). Ported from the emergenciavzla
// brain's scrub_pii.test.ts. Run: node --test scripts/*.test.mjs
//
// Golden rule: free text feeds the public views AND the embedding, so it must
// NEVER contain a phone or cédula — but it MUST keep traits (height, age) and
// dates. Every input below is a REAL string that leaked from the source sites.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scrubContactPII, toE164VE } from "./scrub-pii.mjs";

// Did real PII survive? (7+ digit phone run, or a dotted cédula)
function hasPII(s) {
  if (!s) return false;
  if (/\d\.\d{3}\.\d{3}/.test(s)) return true; // cédula
  for (const m of s.matchAll(/[\d][\d\s().-]{4,}[\d]/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 7 && !/\d{1,2}[/:]\d/.test(m[0])) return true;
  }
  return false;
}

test("teléfono VE pegado se va y queda capturado", () => {
  const { clean, phone } = scrubContactPII("Maria reporta 04121234567");
  assert.equal(hasPII(clean), false);
  assert.equal(phone, "04121234567");
});

test("teléfono internacional (Chile) se va", () => {
  const { clean, phone } = scrubContactPII("familiar +56 9 6455 8638");
  assert.equal(hasPII(clean), false);
  assert.equal(phone, "+56964558638");
});

test("teléfono internacional (Panamá, Argentina) se va", () => {
  assert.equal(hasPII(scrubContactPII("señor mayor +507 68804539").clean), false);
  assert.equal(hasPII(scrubContactPII("Contactarse al número +54 11 5 769 9680").clean), false);
});

test("VE con separadores raros '0424- 158 7859'", () => {
  assert.equal(hasPII(scrubContactPII("La Guaira 0424- 158 7859").clean), false);
});

test("VE en paréntesis '(0412)2408575'", () => {
  assert.equal(hasPII(scrubContactPII("reporta: Miguel (0412)2408575").clean), false);
});

test("cédula con puntos se va (PII de identidad)", () => {
  assert.equal(hasPII(scrubContactPII("11.057.649 reporta: Christian").clean), false);
  assert.equal(hasPII(scrubContactPII("CI 5.163.328 cojea").clean), false);
  assert.equal(hasPII(scrubContactPII("Cédula 7.957.311 Edificio").clean), false);
});

test("número doble mal pegado (16 dígitos) se va", () => {
  assert.equal(hasPII(scrubContactPII("Omaira +58 412 4753045 3045").clean), false);
});

test("ESTATURA en metros se CONSERVA (no es teléfono)", () => {
  const { clean } = scrubContactPII("mide como 1.55 1.60, pelo castaño");
  assert.equal(clean?.includes("1.55"), true);
  assert.equal(clean?.includes("1.60"), true);
});

test("ESTATURA en cm '170' se CONSERVA", () => {
  const { clean } = scrubContactPII("cabello crespo negro, mide 170 reporta: Mery");
  assert.equal(clean?.includes("170"), true);
});

test("EDAD '08 Años' se CONSERVA, pero el teléfono se va", () => {
  const { clean } = scrubContactPII("Cabello Negro, 08 Años reporta: Miguel (0412)2408575");
  assert.equal(clean?.includes("08"), true);
  assert.equal(hasPII(clean), false);
});

test("FECHA '06/25/2026 9:00 AM' se CONSERVA", () => {
  const { clean } = scrubContactPII("Hospital Perez Carreño 06/25/2026 9:00 AM");
  assert.equal(clean?.includes("06/25/2026"), true);
});

test("texto sin PII queda intacto; null seguro", () => {
  assert.equal(scrubContactPII("Morena, delgada, pelo largo").clean, "Morena, delgada, pelo largo");
  assert.equal(scrubContactPII(null).clean, null);
  assert.equal(scrubContactPII("").clean, null);
});

test("toE164VE: normaliza variantes venezolanas", () => {
  assert.equal(toE164VE("04121234567"), "+584121234567");
  assert.equal(toE164VE("+58 412 1234567"), "+584121234567");
  assert.equal(toE164VE("584121234567"), "+584121234567");
  assert.equal(toE164VE(null), null);
});
