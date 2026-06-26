// Lógica de ingesta: valida un reporte entrante y lo rutea a su tabla canónica,
// estampando el source del socio y mandando el contacto a campo privado.
// Corre: node --test scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRow } from "../src/lib/ingest.mjs";

const SRC = "cruzroja.org";

test("missing_person válido → checkins, LOOKING_FOR_SOMEONE, contacto privado", () => {
  const r = buildRow(
    { type: "missing_person", external_id: "x1", name: "Juan Pérez", city: "Caracas", contact: "+58412" },
    SRC
  );
  assert.equal(r.ok, true);
  assert.equal(r.table, "checkins");
  assert.equal(r.row.status, "LOOKING_FOR_SOMEONE");
  assert.equal(r.row.phone_private, "+58412");
  assert.equal(r.row.source, SRC);
  assert.ok(r.row.dedup_key); // fuzzyKey(name)
  assert.equal(r.row.contact, undefined); // checkins no tiene columna contact pública
});

test("help_request válido → help_requests, urgency default MEDIUM, contacto privado", () => {
  const r = buildRow(
    { type: "help_request", external_id: "r1", category: "medical", description: "herido", contact: "+58414", latitude: 10.5, longitude: -66.9 },
    SRC
  );
  assert.equal(r.ok, true);
  assert.equal(r.table, "help_requests");
  assert.equal(r.row.urgency, "MEDIUM");
  assert.equal(r.row.contact, "+58414");
});

test("help_request con category inválida → rechazado", () => {
  const r = buildRow({ type: "help_request", external_id: "r2", category: "lol", description: "x", latitude: 10.5, longitude: -66.9 }, SRC);
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test("help_request sin coords → rechazado con razón clara (no error de DB)", () => {
  const sinCoords = buildRow({ type: "help_request", external_id: "r6", category: "water", description: "agua" }, SRC);
  assert.equal(sinCoords.ok, false);
  assert.match(sinCoords.error, /coordenadas/i);
  // coords fuera de Venezuela también se rechazan (coords() las anula → null).
  const fuera = buildRow({ type: "help_request", external_id: "r7", category: "water", description: "agua", latitude: 48.8, longitude: 2.3 }, SRC);
  assert.equal(fuera.ok, false);
  // con coords válidas en VE → pasa.
  const ok = buildRow({ type: "help_request", external_id: "r8", category: "water", description: "agua", latitude: 10.24, longitude: -67.59 }, SRC);
  assert.equal(ok.ok, true);
  assert.equal(ok.row.latitude, 10.24);
});

test("damaged_building válido → damaged_reports, dedup_key de place_name", () => {
  const r = buildRow(
    { type: "damaged_building", external_id: "b1", place_name: "Edificio Aurora", severity: "COLLAPSE_RISK" },
    SRC
  );
  assert.equal(r.ok, true);
  assert.equal(r.table, "damaged_reports");
  assert.equal(r.row.severity, "COLLAPSE_RISK");
  assert.ok(r.row.dedup_key);
});

test("help_offer válido → help_offers", () => {
  const r = buildRow(
    { type: "help_offer", external_id: "o1", category: "transportation", description: "2 camionetas" },
    SRC
  );
  assert.equal(r.ok, true);
  assert.equal(r.table, "help_offers");
});

test("type desconocido → rechazado", () => {
  assert.equal(buildRow({ type: "ovni", external_id: "z" }, SRC).ok, false);
});

test("external_id faltante → rechazado", () => {
  assert.equal(buildRow({ type: "missing_person", name: "X" }, SRC).ok, false);
});

test("source del body se ignora; gana el del parámetro", () => {
  const r = buildRow(
    { type: "missing_person", external_id: "x2", name: "Ana", source: "atacante.com" },
    SRC
  );
  assert.equal(r.row.source, SRC);
});

test("coords fuera del bounding box de Venezuela → null", () => {
  const r = buildRow(
    { type: "missing_person", external_id: "x3", name: "Ana", latitude: 48.8, longitude: 2.3 },
    SRC
  );
  assert.equal(r.row.latitude, null);
  assert.equal(r.row.longitude, null);
});

test("coords válidas en Venezuela se conservan", () => {
  const r = buildRow(
    { type: "missing_person", external_id: "x4", name: "Ana", latitude: 10.5, longitude: -66.9 },
    SRC
  );
  assert.equal(r.row.latitude, 10.5);
  assert.equal(r.row.longitude, -66.9);
});

test("clamp de longitud: name se recorta a 80", () => {
  const long = "a".repeat(200);
  const r = buildRow({ type: "missing_person", external_id: "x5", name: long }, SRC);
  assert.equal(r.row.name.length, 80);
});

test("checkin SAFE válido", () => {
  const r = buildRow({ type: "checkin", external_id: "c1", name: "María", status: "SAFE" }, SRC);
  assert.equal(r.ok, true);
  assert.equal(r.row.status, "SAFE");
});

test("checkin con status inválido → default SAFE", () => {
  const r = buildRow({ type: "checkin", external_id: "c2", name: "Pedro", status: "BASURA" }, SRC);
  assert.equal(r.row.status, "SAFE");
});

test("help_offer available:false se respeta; variantes laxas también", () => {
  assert.equal(buildRow({ type: "help_offer", external_id: "o2", category: "food", available: false }, SRC).row.available, false);
  assert.equal(buildRow({ type: "help_offer", external_id: "o3", category: "food", available: "false" }, SRC).row.available, false);
  assert.equal(buildRow({ type: "help_offer", external_id: "o4", category: "food", available: 0 }, SRC).row.available, false);
  assert.equal(buildRow({ type: "help_offer", external_id: "o5", category: "food", available: "no" }, SRC).row.available, false);
});

test("help_offer available ausente → default true", () => {
  assert.equal(buildRow({ type: "help_offer", external_id: "o6", category: "food" }, SRC).row.available, true);
  assert.equal(buildRow({ type: "help_offer", external_id: "o7", category: "food", available: true }, SRC).row.available, true);
});

test("damaged_building sin place_name cae a name (y dedup_key sale de él)", () => {
  const r = buildRow({ type: "damaged_building", external_id: "b2", name: "Casa derrumbada" }, SRC);
  assert.equal(r.ok, true);
  assert.equal(r.row.place_name, "Casa derrumbada");
  assert.ok(r.row.dedup_key);
});

test("damaged_building default severity PARTIAL; contacto va a privado", () => {
  const r = buildRow({ type: "damaged_building", external_id: "b3", place_name: "X", contact: "+58412" }, SRC);
  assert.equal(r.row.severity, "PARTIAL");
  assert.equal(r.row.contact, "+58412");
});

test("help_request: valores explícitos se preservan; inválidos caen a default", () => {
  const ok = buildRow({ type: "help_request", external_id: "r3", category: "rescue", description: "x", urgency: "CRITICAL", status: "RESOLVED", latitude: 10.5, longitude: -66.9 }, SRC);
  assert.equal(ok.row.urgency, "CRITICAL");
  assert.equal(ok.row.status, "RESOLVED");
  const bad = buildRow({ type: "help_request", external_id: "r4", category: "rescue", description: "x", urgency: "BOGUS", status: "BOGUS", latitude: 10.5, longitude: -66.9 }, SRC);
  assert.equal(bad.row.urgency, "MEDIUM");
  assert.equal(bad.row.status, "OPEN");
});

test("contacto se recorta al límite de teléfono (30)", () => {
  const r = buildRow({ type: "help_request", external_id: "r5", category: "food", description: "x", contact: "x".repeat(60), latitude: 10.5, longitude: -66.9 }, SRC);
  assert.equal(r.row.contact.length, 30);
});
