// Lógica de lectura: mapeo type→vista, acotado de limit, armado/parseo de cursor.
// Corre: node --test scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveType,
  parseLimit,
  parseSince,
  buildNextCursor,
  REPORT_TYPES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  VIEW_COLUMNS,
  isUuid,
  TABLE_FOR_TYPE,
  VIEW_FOR_TABLE,
  RESOURCES,
  typeForResource,
} from "../src/lib/reports.mjs";

test("REPORT_TYPES son los 5 del catálogo (espejo de la escritura)", () => {
  assert.deepEqual(
    [...REPORT_TYPES].sort(),
    ["checkin", "damaged_building", "help_offer", "help_request", "missing_person"]
  );
});

test("missing_person → public_checkins filtrando LOOKING_FOR_SOMEONE", () => {
  const r = resolveType("missing_person");
  assert.equal(r.ok, true);
  assert.equal(r.view, "public_checkins");
  assert.deepEqual(r.status, ["LOOKING_FOR_SOMEONE"]);
});

test("checkin → public_checkins filtrando SAFE/NEEDS_HELP", () => {
  const r = resolveType("checkin");
  assert.equal(r.view, "public_checkins");
  assert.deepEqual(r.status, ["SAFE", "NEEDS_HELP"]);
});

test("help_request/help_offer/damaged_building → su vista, sin filtro de status", () => {
  assert.equal(resolveType("help_request").view, "public_help_requests");
  assert.equal(resolveType("help_request").status, null);
  assert.equal(resolveType("help_offer").view, "public_help_offers");
  assert.equal(resolveType("damaged_building").view, "public_damaged_reports");
});

test("type inválido/ausente → ok:false", () => {
  assert.equal(resolveType("ovni").ok, false);
  assert.equal(resolveType("").ok, false);
  assert.equal(resolveType(undefined).ok, false);
});

test("select nunca incluye columnas privadas", () => {
  for (const t of REPORT_TYPES) {
    const sel = resolveType(t).select;
    assert.ok(!sel.includes("phone_private"), `${t} expone phone_private`);
    assert.ok(!sel.includes("contact"), `${t} expone contact`);
  }
});

test("damaged: expone verified_at pero NUNCA verified_by (email del admin)", () => {
  const cols = VIEW_COLUMNS.public_damaged_reports;
  assert.ok(cols.includes("verified_at"), "debe conservar verified_at como señal");
  assert.ok(!cols.includes("verified_by"), "verified_by es email interno, no debe exponerse");
});

test("help_offer select incluye source y source_url (vista recreada en 0014)", () => {
  assert.ok(VIEW_COLUMNS.public_help_offers.includes("source"));
  assert.ok(VIEW_COLUMNS.public_help_offers.includes("source_url"));
});

test("parseLimit: default, acotado a MAX, piso 1, basura → default", () => {
  assert.equal(parseLimit(null), DEFAULT_LIMIT);
  assert.equal(parseLimit("50"), 50);
  assert.equal(parseLimit(50), 50);
  assert.equal(parseLimit("9999"), MAX_LIMIT);
  assert.equal(parseLimit("0"), DEFAULT_LIMIT);
  assert.equal(parseLimit("-3"), DEFAULT_LIMIT);
  assert.equal(parseLimit("abc"), DEFAULT_LIMIT);
  assert.equal(parseLimit("12.9"), 12);
});

test("buildNextCursor: página llena → created_at|id; página parcial → null", () => {
  const full = Array.from({ length: 3 }, (_, i) => ({ id: `id${i}`, created_at: `t${i}` }));
  assert.equal(buildNextCursor(full, 3), "t2|id2");
  assert.equal(buildNextCursor(full, 5), null); // 3 < 5 → no hay más
  assert.equal(buildNextCursor([], 100), null);
  assert.equal(buildNextCursor(null, 100), null);
});

test("buildNextCursor: created_at faltante en el último → null (no rompe)", () => {
  const rows = [{ id: "a", created_at: null }];
  assert.equal(buildNextCursor(rows, 1), null);
});

test("isUuid: acepta uuid v4 canónico, rechaza basura", () => {
  assert.equal(isUuid("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid(""), false);
  assert.equal(isUuid(null), false);
  assert.equal(isUuid("550e8400-e29b-41d4-a716-44665544000"), false); // corto
});

test("TABLE_FOR_TYPE cubre los 5 types y rutea a 4 tablas", () => {
  assert.equal(TABLE_FOR_TYPE.missing_person, "checkins");
  assert.equal(TABLE_FOR_TYPE.checkin, "checkins");
  assert.equal(TABLE_FOR_TYPE.help_request, "help_requests");
  assert.equal(TABLE_FOR_TYPE.help_offer, "help_offers");
  assert.equal(TABLE_FOR_TYPE.damaged_building, "damaged_reports");
});

test("RESOURCES lista las 4 tablas con su vista pública", () => {
  assert.equal(RESOURCES.length, 4);
  for (const r of RESOURCES) {
    assert.equal(VIEW_FOR_TABLE[r.table], r.view);
    assert.ok(Array.isArray(r.columns) && r.columns.includes("id"));
    assert.ok(!r.columns.includes("phone_private"));
    assert.ok(!r.columns.includes("contact"));
  }
});

test("typeForResource: checkins se desambigua por status; resto es directo", () => {
  assert.equal(typeForResource("checkins", { status: "LOOKING_FOR_SOMEONE" }), "missing_person");
  assert.equal(typeForResource("checkins", { status: "SAFE" }), "checkin");
  assert.equal(typeForResource("checkins", { status: "NEEDS_HELP" }), "checkin");
  assert.equal(typeForResource("help_requests", {}), "help_request");
  assert.equal(typeForResource("help_offers", {}), "help_offer");
  assert.equal(typeForResource("damaged_reports", {}), "damaged_building");
});

test("parseSince: created_at|id (uuid), timestamp pelón, y basura", () => {
  const uuid = "550e8400-e29b-41d4-a716-446655440000";
  assert.deepEqual(parseSince(`2026-06-26T10:00:00Z|${uuid}`), {
    createdAt: "2026-06-26T10:00:00Z",
    id: uuid,
  });
  assert.deepEqual(parseSince("2026-06-26T10:00:00Z"), {
    createdAt: "2026-06-26T10:00:00Z",
    id: null,
  });
  assert.equal(parseSince(""), null);
  assert.equal(parseSince(null), null);
  assert.equal(parseSince(undefined), null);
});

test("parseSince: acepta el formato real de Postgres (micros + offset)", () => {
  const uuid = "550e8400-e29b-41d4-a716-446655440000";
  assert.deepEqual(parseSince(`2026-06-26T10:00:00.123456+00:00|${uuid}`), {
    createdAt: "2026-06-26T10:00:00.123456+00:00",
    id: uuid,
  });
  // Espacio en vez de T (forma que a veces emite Postgres) también vale.
  assert.deepEqual(parseSince("2026-06-26 10:00:00+00"), {
    createdAt: "2026-06-26 10:00:00+00",
    id: null,
  });
});

test("parseSince: createdAt que no es timestamp → null (cierra inyección PostgREST)", () => {
  // El valor se interpola en `.or(created_at.gt.${createdAt})`; sin validar, un
  // atacante rompe el filtro. Un createdAt no-timestamp se descarta entero.
  assert.equal(parseSince("2026-01-01),or(id.eq.x"), null);
  assert.equal(parseSince("not-a-date|550e8400-e29b-41d4-a716-446655440000"), null);
  assert.equal(parseSince("'; DROP TABLE checkins; --"), null);
});

test("parseSince: id que no es uuid → se descarta el id, conserva el timestamp", () => {
  // id se interpola en `id.gt.${id}`; un id no-uuid se neutraliza (id:null) sin
  // tirar la paginación por timestamp.
  assert.deepEqual(parseSince("2026-06-26T10:00:00Z|abc"), {
    createdAt: "2026-06-26T10:00:00Z",
    id: null,
  });
  assert.deepEqual(parseSince("2026-06-26T10:00:00Z|x),or(true)"), {
    createdAt: "2026-06-26T10:00:00Z",
    id: null,
  });
});
