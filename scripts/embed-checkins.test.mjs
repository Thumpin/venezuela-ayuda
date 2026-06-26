// Tests for the identity-text builder of embed-checkins.mjs — the PII-critical,
// extensible piece. Run: node --test scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkinEmbedText } from "./embed-checkins.mjs";

test("checkinEmbedText: joins name + place_name + message", () => {
  const t = checkinEmbedText({ name: "María Pérez", place_name: "Chacao", message: "chaqueta azul" });
  assert.equal(t, "María Pérez — Chacao — chaqueta azul");
});

test("checkinEmbedText: SCRUBS phone/cédula from message before embedding", () => {
  const t = checkinEmbedText({
    name: "Pedro",
    place_name: "La Guaira",
    message: "reporta familiar 0414-7778899, CI 11.057.649",
  });
  // No phone run and no dotted cédula may reach the provider.
  assert.ok(!/\d\.\d{3}\.\d{3}/.test(t), "cédula leaked");
  assert.ok(!/\d{7,}/.test(t.replace(/[\s().-]/g, "")), "phone leaked");
  assert.ok(t.includes("Pedro") && t.includes("La Guaira"));
});

test("checkinEmbedText: preserves descriptive traits (height)", () => {
  const t = checkinEmbedText({ name: "Ana", place_name: "Catia", message: "mide 1.70, pelo largo" });
  assert.ok(t.includes("1.70"));
});

test("checkinEmbedText: handles missing fields without empty separators", () => {
  assert.equal(checkinEmbedText({ name: "Solo Nombre" }), "Solo Nombre");
  assert.equal(checkinEmbedText({ name: "X", message: null, place_name: undefined }), "X");
});

test("checkinEmbedText: caps length at 800 chars", () => {
  const t = checkinEmbedText({ name: "N", place_name: "P", message: "a".repeat(2000) });
  assert.ok(t.length <= 800);
});
