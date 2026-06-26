// Lógica de PATCH: valida una modificación parcial contra el esquema del type,
// rechaza campos inmutables/no-modificables, clampa texto y mapea contact→privado.
// Corre: node --test scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPatch, IMMUTABLE_FIELDS, MUTABLE_FIELDS } from "../src/lib/patch.mjs";

test("type desconocido → ok:false", () => {
  assert.equal(buildPatch("ovni", { status: "SAFE" }).ok, false);
  assert.equal(buildPatch("", {}).ok, false);
  assert.equal(buildPatch(undefined, {}).ok, false);
});

test("body no-objeto → ok:false", () => {
  assert.equal(buildPatch("checkin", null).ok, false);
  assert.equal(buildPatch("checkin", "x").ok, false);
});

test("campos inmutables (id/source/external_id) → rechazo", () => {
  for (const f of IMMUTABLE_FIELDS) {
    const r = buildPatch("help_request", { [f]: "x", status: "OPEN" });
    assert.equal(r.ok, false, `${f} debería rechazarse`);
    assert.match(r.error, /inmutable/i);
  }
});

test("campo no modificable para el type → rechazo", () => {
  // help_offer no tiene 'severity'
  const r = buildPatch("help_offer", { severity: "COLLAPSED" });
  assert.equal(r.ok, false);
  assert.match(r.error, /no modificable|desconocid/i);
});

test("patch vacío (sin campos modificables) → rechazo", () => {
  assert.equal(buildPatch("checkin", {}).ok, false);
  assert.equal(buildPatch("checkin", { type: "checkin" }).ok, false); // type no cuenta
});

test("checkin: status válido se acepta; mapea a la tabla checkins", () => {
  const r = buildPatch("checkin", { status: "NEEDS_HELP" });
  assert.equal(r.ok, true);
  assert.equal(r.table, "checkins");
  assert.equal(r.patch.status, "NEEDS_HELP");
});

test("checkin: status inválido → rechazo (patch NO clampa, a diferencia de ingest)", () => {
  const r = buildPatch("checkin", { status: "BOGUS" });
  assert.equal(r.ok, false);
});

test("contact se mapea a phone_private en checkins y se clampa a 30", () => {
  const r = buildPatch("checkin", { contact: "x".repeat(60) });
  assert.equal(r.ok, true);
  assert.equal(r.patch.phone_private.length, 30);
  assert.equal(r.patch.contact, undefined);
});

test("contact se mapea a la columna contact en help_request/offer/damaged", () => {
  for (const type of ["help_request", "help_offer", "damaged_building"]) {
    const r = buildPatch(type, { contact: "+58412" });
    assert.equal(r.ok, true);
    assert.equal(r.patch.contact, "+58412");
  }
});

test("help_request: enums válidos se aceptan, inválidos se rechazan", () => {
  assert.equal(buildPatch("help_request", { urgency: "CRITICAL" }).patch.urgency, "CRITICAL");
  assert.equal(buildPatch("help_request", { status: "RESOLVED" }).patch.status, "RESOLVED");
  assert.equal(buildPatch("help_request", { category: "rescue" }).patch.category, "rescue");
  assert.equal(buildPatch("help_request", { urgency: "BOGUS" }).ok, false);
  assert.equal(buildPatch("help_request", { category: "ovni" }).ok, false);
});

test("damaged_building: severity y risk se validan", () => {
  assert.equal(buildPatch("damaged_building", { severity: "COLLAPSED" }).patch.severity, "COLLAPSED");
  assert.equal(buildPatch("damaged_building", { severity: "BOGUS" }).ok, false);
  assert.equal(buildPatch("damaged_building", { risk_level: "ROJO" }).patch.risk_level, "ROJO");
  assert.equal(buildPatch("damaged_building", { risk_level: "VERDE" }).ok, false);
  assert.equal(buildPatch("damaged_building", { risk_priority: true }).patch.risk_priority, true);
});

test("help_offer: available coerciona variantes laxas", () => {
  assert.equal(buildPatch("help_offer", { available: false }).patch.available, false);
  assert.equal(buildPatch("help_offer", { available: "no" }).patch.available, false);
  assert.equal(buildPatch("help_offer", { available: true }).patch.available, true);
});

test("texto se clampa a su límite; vaciar campo opcional → null", () => {
  assert.equal(buildPatch("help_request", { description: "a".repeat(900) }).patch.description.length, 800);
  // city es opcional → vaciar = null (limpia el campo)
  assert.equal(buildPatch("help_request", { city: "   " }).patch.city, null);
});

test("vaciar un campo requerido (NOT NULL) → rechazo", () => {
  assert.equal(buildPatch("checkin", { name: "" }).ok, false); // checkins.name NOT NULL
  assert.equal(buildPatch("help_request", { description: "  " }).ok, false); // NOT NULL
  assert.equal(buildPatch("help_request", { category: "" }).ok, false);
});

test("coords: ambas requeridas juntas, dentro del bounding box VE", () => {
  const ok = buildPatch("help_request", { latitude: 10.5, longitude: -66.9 });
  assert.equal(ok.patch.latitude, 10.5);
  assert.equal(ok.patch.longitude, -66.9);
  // fuera del box → rechazo (patch es estricto, no clampa a null como ingest)
  assert.equal(buildPatch("help_request", { latitude: 48.8, longitude: 2.3 }).ok, false);
  // solo una de las dos → rechazo
  assert.equal(buildPatch("help_request", { latitude: 10.5 }).ok, false);
});

test("found_at: fecha válida pasa; basura se rechaza", () => {
  assert.equal(buildPatch("checkin", { found_at: "2026-06-26T10:00:00Z" }).ok, true);
  assert.equal(buildPatch("checkin", { found_at: "no-es-fecha" }).ok, false);
});

test("MUTABLE_FIELDS expone el catálogo por type (sin campos privados crudos)", () => {
  // El cliente usa 'contact' (no 'phone_private') como nombre de campo.
  assert.ok(MUTABLE_FIELDS.checkin.includes("contact"));
  assert.ok(!MUTABLE_FIELDS.checkin.includes("phone_private"));
  assert.ok(!MUTABLE_FIELDS.checkin.includes("manage_token"));
});
