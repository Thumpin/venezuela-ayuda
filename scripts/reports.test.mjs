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

test("parseSince: created_at|id, timestamp pelón, y basura", () => {
  assert.deepEqual(parseSince("2026-06-26T10:00:00Z|abc"), {
    createdAt: "2026-06-26T10:00:00Z",
    id: "abc",
  });
  assert.deepEqual(parseSince("2026-06-26T10:00:00Z"), {
    createdAt: "2026-06-26T10:00:00Z",
    id: null,
  });
  assert.equal(parseSince(""), null);
  assert.equal(parseSince(null), null);
  assert.equal(parseSince(undefined), null);
});
