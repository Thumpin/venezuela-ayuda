import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIssue } from "./issue-triage.mjs";

function issue({ title = "", body = "", labels = [] } = {}) {
  return { title, body, labels: labels.map((name) => ({ name })) };
}

test("bug form: maps area and critical severity from issue form fields", () => {
  const result = classifyIssue(issue({
    title: "[bug] no carga admin",
    labels: ["bug", "status:needs-triage"],
    body: `### Qué pasa
El panel no carga.

### Área afectada
admin

### Severidad
🔴 Crítico — afecta a usuarios en producción ahora`,
  }));

  assert.deepEqual(result.labels, ["area:admin", "priority:p0"]);
});

test("feature form: maps area and database-impact priority", () => {
  const result = classifyIssue(issue({
    title: "[feat] nueva vista de acopio",
    labels: ["enhancement", "status:needs-triage"],
    body: `### Problema / necesidad
Necesitamos ver centros por país.

### Área
db

### Impacto
- [x] Requiere migración de base de datos
- [ ] Afecta producción / datos reales
- [ ] Solo UI / interno`,
  }));

  assert.deepEqual(result.labels, ["area:db", "priority:p1"]);
});

test("does not override human area or priority labels", () => {
  const result = classifyIssue(issue({
    title: "[bug] formulario falla",
    labels: ["bug", "status:needs-triage", "area:ui", "priority:p3"],
    body: `### Área afectada
admin

### Severidad
🔴 Crítico — afecta a usuarios en producción ahora`,
  }));

  assert.deepEqual(result.labels, []);
});

test("blank or API-created issues get type, status, area, and priority fallbacks", () => {
  const result = classifyIssue(issue({
    title: "OpenAPI endpoint de ingesta devuelve 500",
    body: "El API partner falla en POST /api/v1/reports.",
  }));

  assert.deepEqual(result.labels, ["area:ingesta", "bug", "priority:p2", "status:needs-triage"]);
});

test("security-like public issue gets security and p0 labels without copying details", () => {
  const result = classifyIssue(issue({
    title: "Posible fuga de PII",
    labels: ["status:needs-triage"],
    body: "Creo que se está mostrando manage_token en una vista pública.",
  }));

  assert.deepEqual(result.labels, ["area:ui", "priority:p0", "security"]);
});
