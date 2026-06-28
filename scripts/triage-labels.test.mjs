// Corre: node --test scripts/triage-labels.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractLabels } from "./triage-labels.mjs";

// Helpers to build realistic GitHub Forms issue bodies
function bugBody({ area = "ingesta", severity = "🔴 Crítico — afecta a usuarios en producción ahora" } = {}) {
  return [
    "### Qué pasa\n\nAlgo falla.",
    "### Pasos para reproducir\n\n1. Hacer X",
    "### Esperado vs actual\n\nEsperado: X\nActual: Y",
    "### Entorno\n\nProducción",
    `### Área afectada\n\n${area}`,
    `### Severidad\n\n${severity}`,
    "### Contexto extra\n\n_No response_",
  ].join("\n\n");
}

function featBody({ area = "ui" } = {}) {
  return [
    "### Problema / necesidad\n\nNecesitamos mejorar X.",
    "### Propuesta\n\nAgregar Y.",
    `### Área\n\n${area}`,
    "### Alternativas consideradas\n\n_No response_",
  ].join("\n\n");
}

// ── Bug reports ──────────────────────────────────────────────────────────────

test("bug: área ingesta + severidad crítica → area:ingesta + priority:p0", () => {
  assert.deepEqual(
    extractLabels(bugBody({ area: "ingesta", severity: "🔴 Crítico — afecta a usuarios en producción ahora" })),
    ["area:ingesta", "priority:p0"]
  );
});

test("bug: área datos + severidad alta → area:datos + priority:p1", () => {
  assert.deepEqual(
    extractLabels(bugBody({ area: "datos", severity: "🟠 Alto — funcionalidad rota, hay workaround" })),
    ["area:datos", "priority:p1"]
  );
});

test("bug: área db + severidad media → area:db + priority:p2", () => {
  assert.deepEqual(
    extractLabels(bugBody({ area: "db", severity: "🟡 Medio" })),
    ["area:db", "priority:p2"]
  );
});

test("bug: área ci + severidad menor → area:ci + priority:p3", () => {
  assert.deepEqual(
    extractLabels(bugBody({ area: "ci", severity: "🟢 Menor" })),
    ["area:ci", "priority:p3"]
  );
});

test("bug: área 'no sé' → sin label de área, priority igual se aplica", () => {
  const labels = extractLabels(bugBody({ area: "no sé", severity: "🟡 Medio" }));
  assert.ok(!labels.includes("area:no sé"));
  assert.ok(labels.includes("priority:p2"));
});

// ── Feature requests ─────────────────────────────────────────────────────────

test("feat: área ui → solo area:ui (sin priority, no hay severidad)", () => {
  assert.deepEqual(extractLabels(featBody({ area: "ui" })), ["area:ui"]);
});

test("feat: área admin → area:admin", () => {
  assert.deepEqual(extractLabels(featBody({ area: "admin" })), ["area:admin"]);
});

test("feat: área fr → area:fr", () => {
  assert.deepEqual(extractLabels(featBody({ area: "fr" })), ["area:fr"]);
});

// ── Edge cases ────────────────────────────────────────────────────────────────

test("body vacío → sin labels", () => {
  assert.deepEqual(extractLabels(""), []);
});

test("body null/undefined → sin labels", () => {
  assert.deepEqual(extractLabels(null), []);
  assert.deepEqual(extractLabels(undefined), []);
});

test("área desconocida → sin label de área", () => {
  const labels = extractLabels(bugBody({ area: "inventado" }));
  assert.ok(!labels.some((l) => l.startsWith("area:")));
});

test("nunca agrega status:triaged", () => {
  const labels = extractLabels(bugBody());
  assert.ok(!labels.includes("status:triaged"));
});
