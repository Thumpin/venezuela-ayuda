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
    { type: "help_request", external_id: "r1", category: "medical", description: "herido", contact: "+58414" },
    SRC
  );
  assert.equal(r.ok, true);
  assert.equal(r.table, "help_requests");
  assert.equal(r.row.urgency, "MEDIUM");
  assert.equal(r.row.contact, "+58414");
});

test("help_request con category inválida → rechazado", () => {
  const r = buildRow({ type: "help_request", external_id: "r2", category: "lol", description: "x" }, SRC);
  assert.equal(r.ok, false);
  assert.ok(r.error);
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
