// Pure parsing + mapping for issue auto-triage. No API calls — fully testable.
// Corre: node --test scripts/triage-labels.test.mjs

const AREA_MAP = {
  ingesta: "area:ingesta",
  datos: "area:datos",
  fr: "area:fr",
  admin: "area:admin",
  ui: "area:ui",
  db: "area:db",
  ci: "area:ci",
};

// Emoji prefix → priority label (bug reports only)
const SEVERITY_MAP = [
  { prefix: "🔴", label: "priority:p0" },
  { prefix: "🟠", label: "priority:p1" },
  { prefix: "🟡", label: "priority:p2" },
  { prefix: "🟢", label: "priority:p3" },
];

/**
 * Extract the value of a GitHub Form field from the issue body.
 * GitHub Forms render: "### <label>\n\n<value>\n"
 */
function extractField(body, headingPattern) {
  const re = new RegExp(`###\\s+${headingPattern}\\s*\\n+([^\\n#]+)`, "i");
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Given an issue body, return the list of labels to add.
 * Only adds — never removes existing labels.
 * Never adds status:triaged (that stays human-only).
 */
export function extractLabels(body) {
  if (!body) return [];
  const labels = [];

  // Area — both "Área" (feature request) and "Área afectada" (bug report)
  const area = extractField(body, "Área(?:\\s+afectada)?");
  if (area && AREA_MAP[area]) {
    labels.push(AREA_MAP[area]);
  }

  // Severity → priority (bug reports only; feature requests have no severity field)
  const severity = extractField(body, "Severidad");
  if (severity) {
    const match = SEVERITY_MAP.find((e) => severity.startsWith(e.prefix));
    if (match) labels.push(match.label);
  }

  return labels;
}
