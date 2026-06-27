import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDump, detectFormat } from "../src/lib/batchIngest.mjs";

test("detectFormat", () => {
  assert.equal(detectFormat('[{"a":1}]'), "json");
  assert.equal(detectFormat('{"reports":[]}'), "json");
  assert.equal(detectFormat("INSERT INTO t (a) VALUES (1);"), "sql");
  assert.equal(detectFormat("type,external_id\nx,1"), "csv");
  assert.equal(detectFormat("   "), "empty");
});

test("JSON: array and {reports:[]}", () => {
  const a = parseDump('[{"type":"checkin","external_id":"j1","name":"A"}]');
  assert.equal(a.length, 1);
  assert.equal(a[0].external_id, "j1");
  const b = parseDump('{"reports":[{"external_id":"j2"}]}');
  assert.equal(b[0].external_id, "j2");
  assert.throws(() => parseDump("{not json"), /JSON inv|Formato|arreglo/);
});

test("CSV: headers, quoted commas, empty cells dropped", () => {
  const csv =
    'type,external_id,description,latitude\n' +
    'help_request,c1,"agua, urgente",10.5\n' +
    'checkin,c2,,';
  const rows = parseDump(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].description, "agua, urgente");
  assert.equal(rows[0].latitude, "10.5");
  assert.equal(rows[1].external_id, "c2");
  assert.equal("description" in rows[1], false); // empty cell omitted
});

test("SQL: INSERT…VALUES, '' escaping, NULL, numbers, table→type", () => {
  const sql =
    "INSERT INTO help_requests (external_id, category, description, latitude) " +
    "VALUES ('s1','water','agua O''Brien',10.5), ('s2','food',NULL,10.4);";
  const rows = parseDump(sql);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].type, "help_request"); // table mapped to report type
  assert.equal(rows[0].description, "agua O'Brien"); // '' unescaped
  assert.equal(rows[0].latitude, 10.5); // numeric
  assert.equal("description" in rows[1], false); // NULL omitted
});

test("SQL: phone_private remapped to contact", () => {
  const rows = parseDump(
    "INSERT INTO checkins (external_id, name, phone_private) VALUES ('p1','Ana','+58412');",
  );
  assert.equal(rows[0].contact, "+58412");
  assert.equal("phone_private" in rows[0], false);
});

test("empty / unparseable inputs throw", () => {
  assert.throws(() => parseDump(""), /vac/);
  assert.throws(() => parseDump("INSERT INTO t (a) VALUES ;"), /INSERT|filas/);
});
