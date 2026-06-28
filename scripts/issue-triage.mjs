#!/usr/bin/env node
// Deterministic issue triage helper for GitHub Actions.
//
// It reads the issue form body and existing labels, then returns only labels that
// are missing. It intentionally does not mark issues as `status:triaged`; a human
// triager still owns that decision.

import fs from "node:fs";

const TYPE_LABELS = new Set(["bug", "enhancement", "documentation", "question"]);
const STATUS_LABEL_PREFIX = "status:";
const AREA_LABEL_PREFIX = "area:";
const PRIORITY_LABEL_PREFIX = "priority:";

const AREA_BY_FORM_VALUE = {
  ingesta: "area:ingesta",
  datos: "area:datos",
  fr: "area:fr",
  admin: "area:admin",
  ui: "area:ui",
  db: "area:db",
  ci: "area:ci",
};

const AREA_KEYWORDS = [
  ["area:ingesta", /\b(api|ingesta|ingest|hub|partner|socio|x-api-key|endpoint|openapi|reportes?)\b/i],
  ["area:datos", /\b(datos|dedup|duplicad[oa]s?|csv|clasificaci[oó]n|classify|calidad de datos)\b/i],
  ["area:fr", /\b(fr-api|reconocimiento facial|facial|face recognition|rostro|cara)\b/i],
  ["area:admin", /\b(admin|moderaci[oó]n|moderador|panel)\b/i],
  ["area:ui", /\b(ui|ux|mapa|frontend|formulario|m[oó]vil|mobile|vista|pantalla)\b/i],
  ["area:db", /\b(db|base de datos|database|supabase|postgres|sql|migraci[oó]n|migration|rls)\b/i],
  ["area:ci", /\b(ci|github actions|workflow|vercel|deploy|despliegue|staging|build|lint)\b/i],
];

const SECURITY_RE =
  /\b(vulnerabilidad|seguridad|security|pii|fuga|leak|secreto|secret|api key|token|credential|credencial|contrase(?:n|ñ)a|password|manage_token|service role|supabase_secret_key|x-api-key)\b/i;

function stripAccents(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function normalize(value) {
  return stripAccents(value).toLowerCase().trim();
}

function normalizeLabel(value) {
  return String(value ?? "").trim();
}

function labelsFromIssue(issue) {
  return (issue?.labels ?? [])
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter(Boolean)
    .map(normalizeLabel);
}

function hasLabel(labels, label) {
  return labels.some((existing) => existing.toLowerCase() === label.toLowerCase());
}

function hasPrefix(labels, prefix) {
  return labels.some((label) => label.toLowerCase().startsWith(prefix));
}

function hasAnyType(labels) {
  return labels.some((label) => TYPE_LABELS.has(label.toLowerCase()));
}

function getSections(body) {
  const text = String(body ?? "").replace(/\r\n/g, "\n");
  const matches = [...text.matchAll(/^###\s+(.+?)\s*$/gm)];
  const sections = new Map();

  for (let i = 0; i < matches.length; i++) {
    const title = normalize(matches[i][1]);
    const start = matches[i].index + matches[i][0].length;
    const end = matches[i + 1]?.index ?? text.length;
    const value = text
      .slice(start, end)
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
    sections.set(title, value);
  }

  return sections;
}

function getField(sections, names) {
  for (const name of names) {
    const value = sections.get(normalize(name));
    if (value) return value;
  }
  return "";
}

function checkedItems(markdown) {
  return String(markdown ?? "")
    .split("\n")
    .map((line) => line.match(/^\s*-\s+\[[xX]\]\s+(.+?)\s*$/)?.[1])
    .filter(Boolean);
}

function inferType(issue, sections, text) {
  const title = normalize(issue?.title ?? "");

  if (title.startsWith("[bug]") || getField(sections, ["Qué pasa", "Que pasa"])) {
    return "bug";
  }
  if (title.startsWith("[feat]") || getField(sections, ["Problema / necesidad"])) {
    return "enhancement";
  }
  if (/\b(bug|error|falla|fallo|roto|rota|no carga|500|exception|crash)\b/i.test(text)) {
    return "bug";
  }
  if (/\b(docs?|documentaci[oó]n|readme|gu[ií]a)\b/i.test(text)) {
    return "documentation";
  }
  if (/\b(pregunta|question|duda|consulta|como|c[oó]mo)\b/i.test(text)) {
    return "question";
  }
  return null;
}

function inferArea(sections, text) {
  const area = normalize(getField(sections, ["Área afectada", "Area afectada", "Área", "Area"]));
  const mapped = AREA_BY_FORM_VALUE[area];
  if (mapped) return mapped;

  for (const [label, re] of AREA_KEYWORDS) {
    if (re.test(text)) return label;
  }
  return null;
}

function inferPriority(sections, text, inferredType) {
  const severity = normalize(getField(sections, ["Severidad"]));
  if (severity.includes("critico") || severity.includes("afecta a usuarios en produccion ahora")) {
    return "priority:p0";
  }
  if (severity.includes("alto")) return "priority:p1";
  if (severity.includes("medio")) return "priority:p2";
  if (severity.includes("menor")) return "priority:p3";

  const impact = checkedItems(getField(sections, ["Impacto"])).map(normalize);
  if (impact.some((item) => item.includes("afecta produccion") || item.includes("datos reales"))) {
    return "priority:p1";
  }
  if (impact.some((item) => item.includes("migracion de base de datos"))) {
    return "priority:p1";
  }
  if (impact.some((item) => item.includes("solo ui") || item.includes("interno"))) {
    return "priority:p3";
  }

  if (/\b(producci[oó]n|prod|ca[ií]do|down|bloquea|cr[ií]tico|critico)\b/i.test(text)) {
    return inferredType === "bug" ? "priority:p1" : "priority:p2";
  }
  if (inferredType === "bug" || inferredType === "enhancement") return "priority:p2";
  return null;
}

export function classifyIssue(issue) {
  const existingLabels = labelsFromIssue(issue);
  const labelsToAdd = new Set();
  const body = String(issue?.body ?? "");
  const title = String(issue?.title ?? "");
  const text = `${title}\n\n${body}`;
  const sections = getSections(body);

  const addIfMissing = (label) => {
    if (label && !hasLabel(existingLabels, label)) labelsToAdd.add(label);
  };

  const securityLike = SECURITY_RE.test(text);
  if (securityLike) addIfMissing("security");

  const inferredType = inferType(issue, sections, text);
  if (!hasAnyType(existingLabels)) addIfMissing(inferredType);

  if (!hasPrefix(existingLabels, STATUS_LABEL_PREFIX)) {
    addIfMissing("status:needs-triage");
  }

  if (!hasPrefix(existingLabels, AREA_LABEL_PREFIX)) {
    addIfMissing(inferArea(sections, text));
  }

  if (!hasPrefix(existingLabels, PRIORITY_LABEL_PREFIX)) {
    addIfMissing(securityLike ? "priority:p0" : inferPriority(sections, text, inferredType));
  }

  return { labels: [...labelsToAdd].sort() };
}

function writeGithubOutput(result) {
  const outputPath = process.env.GITHUB_OUTPUT;
  const serialized = JSON.stringify(result.labels);
  if (!outputPath) {
    process.stdout.write(`${serialized}\n`);
    return;
  }
  fs.appendFileSync(outputPath, `labels=${serialized}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const eventPath = process.argv[2] || process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error("Usage: node scripts/issue-triage.mjs <github-event.json>");
  }

  const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  writeGithubOutput(classifyIssue(event.issue));
}
