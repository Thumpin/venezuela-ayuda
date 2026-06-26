// Puerta única de escritura interna: los server actions del sitio pasan por las
// MISMAS RPC del API externo (ingest_reports/patch_report/delete_report), pero
// atribuidas a NUESTRO socio (VA_PARTNER_ID/VA_SOURCE). Acá se prueba la lógica
// PURA: armado de parámetros (inyección de la identidad propia, forense null por
// default) y construcción de la fila de collection_centers. Las RPC y su escritura
// atómica + audit viven en SQL (migración 0018) y no se prueban acá.
// Corre: node --test scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ingestArgs,
  patchArgs,
  deleteArgs,
  buildCenterRow,
} from "../src/lib/internalWrite.mjs";
import { VA_PARTNER_ID, VA_SOURCE } from "../src/lib/canonical.mjs";

const VA_ID = "11111111-1111-4111-8111-111111111111";

test("VA_PARTNER_ID es el uuid fijo y VA_SOURCE el dominio propio", () => {
  assert.equal(VA_PARTNER_ID, VA_ID);
  assert.equal(VA_SOURCE, "venezuela-ayuda.com");
});

test("ingestArgs inyecta partner/source y nulea el forense por default", () => {
  const a = ingestArgs("checkins", [{ name: "x" }]);
  assert.equal(a.p_table, "checkins");
  assert.deepEqual(a.p_rows, [{ name: "x" }]);
  assert.equal(a.p_partner, VA_ID);
  assert.equal(a.p_source, "venezuela-ayuda.com");
  assert.equal(a.p_request_id, null);
  assert.equal(a.p_ip, null);
  assert.equal(a.p_user_agent, null);
});

test("ingestArgs propaga el contexto forense cuando existe", () => {
  const a = ingestArgs("checkins", [], { requestId: "rid", ip: "1.2.3.4", userAgent: "ua" });
  assert.equal(a.p_request_id, "rid");
  assert.equal(a.p_ip, "1.2.3.4");
  assert.equal(a.p_user_agent, "ua");
});

test("patchArgs lleva id + patch + atribución propia", () => {
  const a = patchArgs("help_requests", "id-1", { status: "RESOLVED" });
  assert.equal(a.p_table, "help_requests");
  assert.equal(a.p_id, "id-1");
  assert.deepEqual(a.p_patch, { status: "RESOLVED" });
  assert.equal(a.p_partner, VA_ID);
  assert.equal(a.p_source, "venezuela-ayuda.com");
});

test("deleteArgs lleva tabla + id + atribución (la RPC captura el before y audita DELETE)", () => {
  const a = deleteArgs("collection_centers", "c-9");
  assert.equal(a.p_table, "collection_centers");
  assert.equal(a.p_id, "c-9");
  assert.equal(a.p_partner, VA_ID);
  assert.equal(a.p_source, "venezuela-ayuda.com");
  assert.equal(a.p_patch, undefined); // delete no manda patch
  assert.equal(a.p_rows, undefined); // ni rows
});

test("buildCenterRow: sin voluntarios → needs solo centro-de-acopio; source 'user'; oculto/no-verificado", () => {
  const row = buildCenterRow({ name: "Centro", country: "España", needs_volunteers: false, manage_token: "t" });
  assert.deepEqual(row.needs, ["centro-de-acopio"]);
  assert.equal(row.source, "user");
  assert.equal(row.verified, false);
  assert.equal(row.hidden, false);
  assert.equal(row.manage_token, "t");
  assert.equal(row.external_id, undefined); // collection_centers no tiene external_id
});

test("buildCenterRow: con voluntarios → needs agrega 'voluntarios'", () => {
  const row = buildCenterRow({ name: "C", country: "VE", needs_volunteers: true });
  assert.deepEqual(row.needs, ["centro-de-acopio", "voluntarios"]);
  assert.equal(row.needs_volunteers, true);
});

test("buildCenterRow: opcionales ausentes → null (no undefined, para no romper el casteo jsonb)", () => {
  const row = buildCenterRow({ name: "C", country: "VE" });
  assert.equal(row.city, null);
  assert.equal(row.latitude, null);
  assert.equal(row.can_ship_to_venezuela, null);
  assert.equal(row.volunteers_count, null);
  assert.equal(row.needs_volunteers, false);
});
