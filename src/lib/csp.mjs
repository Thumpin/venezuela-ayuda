// Edge-runtime-safe: no Node.js imports. Imported by both middleware.ts and
// apiPolicy.mjs so the CSP directives have a single source of truth.

const CSP_DIRECTIVES = {
  "default-src": ["'self'"],
  "base-uri": ["'self'"],
  "object-src": ["'none'"],
  "frame-ancestors": ["'none'"],
  "form-action": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    "'wasm-unsafe-eval'",
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
    "https://cdn.jsdelivr.net",
  ],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https://*.supabase.co",
    "https://*.tile.openstreetmap.org",
    "https://api.maptiler.com",
    "https://*.maptiler.com",
    "https://www.google-analytics.com",
  ],
  "font-src": ["'self'", "data:", "https://cdn.jsdelivr.net"],
  "worker-src": ["'self'", "blob:"],
  "connect-src": [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://nominatim.openstreetmap.org",
    "https://*.tile.openstreetmap.org",
    "https://api.maptiler.com",
    "https://*.maptiler.com",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://*.google-analytics.com",
    "https://cdn.jsdelivr.net",
  ],
  "manifest-src": ["'self'"],
  "media-src": ["'self'", "data:", "blob:"],
};

export function contentSecurityPolicy() {
  const body = Object.entries(CSP_DIRECTIVES)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
  return `${body}; upgrade-insecure-requests`;
}
