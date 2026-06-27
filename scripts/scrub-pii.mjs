// PII scrub for free text — ported from the emergenciavzla "brain"
// (supabase/functions/_shared/ingest_common.ts). Pure + testable (`node --test`).
//
// WHY: free-text fields (checkins.message, damaged_reports.description) feed both
// the public views AND — once 0015's embedding lands — the OpenAI embedding call.
// A phone or cédula must NEVER reach either. This strips them BEFORE embedding,
// while preserving descriptive traits (height, age) and dates that look numeric
// but are not PII. Every test case below is a real string that leaked from the
// source sites before scrubbing existed.

// Phone: '+' country code + >=7 digits, OR a VE (0)4xx sequence with any mix of
// repeated separators (spaces, dashes, dots, parens), OR a 7..15 run of glued
// digits. Captures the whole number.
const PHONE_RE =
  /\+\d[\d\s().-]{6,}\d|\(?0?4\d{2}\)?[\s().-]*\d{3}[\s().-]*\d{4}|\b\d{7,15}\b/g;
// Venezuelan cédula: optional V/E prefix, optional dots/dashes, 6-9 digits.
const CEDULA_DOTTED_RE = /\b[VE]?-?\d{1,2}\.\d{3}\.\d{3}\b/gi;
const CEDULA_PLAIN_RE = /\b[VE]-?\d{6,9}\b/gi;
const CEDULA_CI_RE = /\b(?:CI|C[IÍ]|C[EÉ]DULA)\s*[:.]?\s*[VE]?-?\d[\d.\s-]{5,12}\d\b/gi;

// Is this run a plausible phone? 7..15 effective digits.
function isPhoneRun(s) {
  const d = s.replace(/\D/g, "");
  return d.length >= 7 && d.length <= 15;
}

// Strip phones + cédulas from free text. Returns { clean, phone } where `phone`
// is the FIRST plausible phone found (so the caller can relocate it into a
// private field) and `clean` is the text safe to embed / show publicly.
export function scrubContactPII(text) {
  // Normalize empty/nullish to a null clean — an empty string carries no text
  // and stays consistent with the `clean || null` at the end.
  if (!text) return { clean: null, phone: null };

  // 1) First plausible phone → for relocation into a private field.
  let phone = null;
  for (const m of text.matchAll(PHONE_RE)) {
    if (isPhoneRun(m[0])) {
      const d = m[0].replace(/[^\d+]/g, "");
      phone = m[0].trim().startsWith("+") ? "+" + d.replace(/\D/g, "") : d;
      break;
    }
  }

  // 2) Remove from public text: phones (only valid runs) + cédulas, while
  //    preserving heights ("1.55"), ages ("08 Años"), and dates ("06/25/2026").
  const clean = text
    .replace(PHONE_RE, (m) => (isPhoneRun(m) ? " " : m)) // leaves "1.55" (not a run)
    // Residual PII: a run with 8+ effective digits that is NOT a date/time nor a
    // decimal series (heights like "1.55 1.60"). Catches mis-glued 16-digit
    // numbers that isPhoneRun rejects, without touching heights or dates.
    .replace(/[\d][\d\s().-]{5,}[\d]/g, (m) => {
      const isDateTime = /\d{1,2}[/:]\d/.test(m);
      const isDecimalSeries = /^\d{1,3}([.,]\d{1,2}[\s]*){1,}$/.test(m.trim());
      return isDateTime || isDecimalSeries || m.replace(/\D/g, "").length < 8 ? m : " ";
    })
    .replace(CEDULA_DOTTED_RE, " ")
    .replace(CEDULA_PLAIN_RE, " ")
    .replace(CEDULA_CI_RE, " ")
    // dangling labels left behind ("CI", "Cédula", "número", "teléfono")
    .replace(/\b(c[ií]|c[eé]dula|tel[eé]fono|n[uú]mero|contactarse al|llamar al)\b\s*[:.]?/gi, " ")
    // orphan '+'/'(' the removed phone left behind
    .replace(/[+(]\s*(?=[\s,.;]|$)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
  return { clean: clean || null, phone };
}

// Best-effort Venezuelan phone → E.164. The result is PRIVATE; never exposed.
export function toE164VE(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (!digits.replace(/\D/g, "")) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.startsWith("58")) return "+" + digits;
  if (digits.startsWith("0")) return "+58" + digits.slice(1);
  return "+58" + digits;
}
