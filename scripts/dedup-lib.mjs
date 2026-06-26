// Dedup puro y testeable (`node --test`). Importado por src/lib/dedup.ts,
// src/lib/ingest.mjs (dedup_key), scripts/backfill-dedupkey.mjs y los tests.
//
// Principio de diseño: COSTO ASIMÉTRICO. Un falso merge borra datos reales y es
// inaceptable; un merge perdido solo deja un duplicado, que es recuperable. Por
// eso el dedup de limpieza solo fusiona con confianza >= 0.95 y, debajo de eso,
// prefiere dejar el duplicado. Ver clusterNames / nameConfidence.

export const stripAccents = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
export const norm = (s) => stripAccents(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const STOP = new Set(["de", "del", "la", "las", "el", "los", "y", "con", "un", "una", "su", "a", "en", "o", "e", "da", "do", "san", "santa", "sr", "sra", "srta", "don", "dona", "nino", "nina", "bebe", "ano", "anos", "sus", "al", "the", "and"]);

// Clave fuzzy barata para idempotencia en el INGEST (dedup_key cross-source): sin
// acentos/stopwords/tokens cortos, tokens ordenados. NO se usa para la limpieza
// destructiva — esa usa clusterNames (confianza calibrada). "Pérez, Juan" ≈
// "juan perez" ≈ "Juan A. Pérez".
export function fuzzyKey(name) {
  const toks = norm(name).split(" ").filter((t) => t.length >= 3 && !STOP.has(t));
  if (toks.length >= 2) return `mp:${[...new Set(toks)].sort().join(" ")}`;
  return `mp:${norm(name)}`;
}

// Celda geográfica gruesa (~0.3° ≈ 33 km) usada como DISCRIMINADOR: el mismo
// nombre en regiones distintas (Caracas vs Maracaibo) son personas distintas y
// NO deben fusionarse. La ubicación en texto libre de una misma persona varía
// pero se geocodifica al mismo centroide → misma celda → sí fusiona los repetidos.
// Sin coords → "" (cae a solo-nombre, comportamiento previo).
export function geoCell(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `${Math.round(lat / 0.3)},${Math.round(lng / 0.3)}`;
}

// Clave de persona para el dedup del INGEST: nombre + región. Dos homónimos en
// regiones distintas conservan claves distintas (no se descarta a nadie real).
export function personKey(name, lat, lng) {
  const cell = geoCell(lat, lng);
  return cell ? `${fuzzyKey(name)}@${cell}` : fuzzyKey(name);
}

// Separa un nombre en tokens SIGNIFICATIVOS (>=3 chars) y DISCRIMINADORES de
// unidad (números o letra suelta: "Torre 1" vs "Torre 2", "Edificio A" vs "B").
// Los discriminadores son la base del veto: si difieren, NUNCA es el mismo lugar.
export function parseName(name) {
  const n = norm(name);
  const sig = [], units = [];
  for (const t of n.split(" ").filter(Boolean)) {
    if (/^\d+$/.test(t) || t.length === 1) { units.push(t); continue; } // discriminador (antes que STOP: "Torre A" la A cuenta)
    if (STOP.has(t)) continue;
    if (t.length >= 3) sig.push(t); // token significativo (length-2 = ruido)
  }
  return { sig: [...new Set(sig)].sort(), units: units.sort(), norm: n };
}

// Jaro / Jaro-Winkler: similitud char-level en [0,1], tolerante a typos y con
// bonus por prefijo común (bueno para nombres propios). Sin deps.
export function jaro(a, b) {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (!la || !lb) return 0;
  const range = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const aM = new Array(la).fill(false), bM = new Array(lb).fill(false);
  let m = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - range), hi = Math.min(i + range + 1, lb);
    for (let j = lo; j < hi; j++) if (!bM[j] && a[i] === b[j]) { aM[i] = bM[j] = true; m++; break; }
  }
  if (!m) return 0;
  let k = 0, t = 0;
  for (let i = 0; i < la; i++) if (aM[i]) { while (!bM[k]) k++; if (a[i] !== b[k]) t++; k++; }
  t /= 2;
  return (m / la + m / lb + (m - t) / m) / 3;
}
export function jaroWinkler(a, b, p = 0.1) {
  const j = jaro(a, b);
  let l = 0;
  while (l < 4 && l < a.length && l < b.length && a[l] === b[l]) l++;
  return j + l * p * (1 - j);
}

const TOKEN_SIM = 0.9; // un token cuenta como "el mismo" si su Jaro-Winkler >= esto

// Confianza [0,1] de que dos nombres parseados sean el MISMO lugar/persona.
//   - Veto duro: discriminadores de unidad distintos → 0 (Torre 1 ≠ Torre 2).
//   - Si no, alinea tokens significativos y promedia la similitud char-level.
//     confianza = "qué porción del nombre más largo queda explicada por el match".
export function nameConfidence(a, b) {
  if (a.units.join(" ") !== b.units.join(" ")) return 0; // veto
  if (a.norm === b.norm) return 1;
  const big = a.sig.length >= b.sig.length ? a.sig : b.sig;
  const small = big === a.sig ? b.sig : a.sig;
  if (!big.length) return 0; // sin tokens significativos y norm distinto → no arriesgar
  const used = new Array(big.length).fill(false);
  let sum = 0;
  for (const s of small) {
    let best = 0, bi = -1;
    for (let i = 0; i < big.length; i++) {
      if (used[i]) continue;
      const sim = jaroWinkler(s, big[i]);
      if (sim > best) { best = sim; bi = i; }
    }
    if (bi >= 0 && best >= TOKEN_SIM) { used[bi] = true; sum += best; }
  }
  return sum / big.length;
}

// Agrupa nombres por identidad probable. Sin fuerza bruta: blocking por token
// compartido (índice invertido) + union-find, solo se comparan pares que comparten
// un token significativo (o norm exacto). Devuelve clusters de ÍNDICES + nº de
// buckets demasiado grandes para comparar (se reportan, no se descartan en silencio).
export function clusterNames(names, threshold = 0.95, maxBucket = 2000) {
  const parsed = names.map(parseName);
  const parent = names.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (i, j) => { parent[find(i)] = find(j); };

  // Norm exacto → mismo lugar siempre (cubre single-token y solo-unidad idénticos).
  const byNorm = new Map();
  parsed.forEach((p, i) => (byNorm.get(p.norm) || byNorm.set(p.norm, []).get(p.norm)).push(i));
  for (const idxs of byNorm.values()) for (let a = 1; a < idxs.length; a++) union(idxs[0], idxs[a]);

  // Blocking por token significativo.
  const byTok = new Map();
  parsed.forEach((p, i) => { for (const t of p.sig) (byTok.get(t) || byTok.set(t, []).get(t)).push(i); });
  let skippedBuckets = 0;
  for (const idxs of byTok.values()) {
    if (idxs.length < 2) continue;
    if (idxs.length > maxBucket) { skippedBuckets++; continue; }
    for (let a = 0; a < idxs.length; a++) for (let b = a + 1; b < idxs.length; b++) {
      const i = idxs[a], j = idxs[b];
      if (find(i) === find(j)) continue;
      if (nameConfidence(parsed[i], parsed[j]) >= threshold) union(i, j);
    }
  }

  const out = new Map();
  for (let i = 0; i < names.length; i++) { const r = find(i); (out.get(r) || out.set(r, []).get(r)).push(i); }
  return { clusters: [...out.values()], skippedBuckets };
}
