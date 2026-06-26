// Auth por API key del hub central. Puro y testeable (`node --test`): solo
// depende de node:crypto, no del cliente Supabase. El wiring real (query a
// api_partners) lo arma la ruta server-side, inyectando `fetchByHash` a
// `createAuthenticator`.
//
// Diseño para escala: cada `POST /api/v1/reports` valida una key; sin cache eso
// sería un round-trip a Postgres por request. `createAuthenticator` cachea
// `key_hash → partner` con TTL corto (default 60s). La revocación tiene lag
// ≤ TTL — aceptable para coordinación de emergencia.

import { createHash, randomBytes } from "node:crypto";

// sha256 hex de la key cruda. Guardamos/lookupeamos por este hash, nunca la key.
// La entropía de la key (32 bytes) hace innecesario un salt.
export function hashKey(raw) {
  return createHash("sha256").update(String(raw)).digest("hex");
}

// Primeros chars de la key, para identificarla en el admin sin revelarla.
export function parsePrefix(raw) {
  return String(raw).slice(0, 12);
}

// Genera una API key nueva: `va_live_<32 bytes base64url>`. Se entrega una sola
// vez; en la DB queda su hash + prefix.
export function generateApiKey() {
  return `va_live_${randomBytes(32).toString("base64url")}`;
}

// Crea un autenticador con cache. `fetchByHash(hash)` devuelve el partner
// (`{ partnerId, source, scopes }`) o `null`; si lanza (error de DB), el error
// se propaga y NO se cachea (un fallo transitorio no debe bloquear una key
// válida por todo el TTL).
//
// Endurecido para una superficie pública de alto volumen:
//   - Los hits (keys válidas) se cachean `ttlMs`; los misses solo `missTtlMs`
//     corto. Los misses son el vector de crecimiento controlable por un atacante
//     no autenticado (cada key inválida distinta = una entrada), así que su vida
//     es corta.
//   - Las entradas expiradas se borran al leerlas, y hay un tope duro de tamaño
//     (`maxEntries`) que vacía el cache si se rebasa → memoria acotada.
export function createAuthenticator(
  fetchByHash,
  { ttlMs = 60_000, missTtlMs = 5_000, maxEntries = 10_000, now = Date.now } = {}
) {
  const cache = new Map(); // hash → { value, expires }

  return async function authenticate(apiKey) {
    if (!apiKey) return null;
    const hash = hashKey(apiKey);

    const hit = cache.get(hash);
    if (hit) {
      if (hit.expires > now()) return hit.value;
      cache.delete(hash); // expirada → evict al leer
    }

    const value = (await fetchByHash(hash)) ?? null; // si fetchByHash lanza, se propaga sin cachear
    if (cache.size >= maxEntries) cache.clear(); // tope duro: memoria acotada
    cache.set(hash, { value, expires: now() + (value ? ttlMs : missTtlMs) });
    return value;
  };
}
