# Cambios en `fix_csp`

Dos cambios propios respecto a `staging`.

---

## 1. CSP ausente en producción + mapa roto (`middleware.ts`, `src/lib/mapStyle.ts`)

El middleware solo corría para rutas `/admin` — el matcher era `["/admin/:path*"]`. Eso significaba que el header `Content-Security-Policy` nunca se enviaba en las páginas públicas en producción.

Además, el mapa usaba un solo subdominio de OpenStreetMap (`tile.openstreetmap.org`) que no coincidía con los que estaba declarando la CSP (`a.tile`, `b.tile`, `c.tile`), causando que los tiles fueran bloqueados por el navegador.

**Qué se hizo:**
- El middleware ahora corre en todas las rutas HTML (matcher actualizado para excluir solo assets estáticos de Next).
- Se extrae la lógica CSP a una función `applyCSP` y se aplica en todos los paths, incluyendo el flujo de refresh de sesión del admin.
- `mapStyle.ts` ahora declara los tres subdominios de OSM (`a.`, `b.`, `c.`) que coinciden con lo que la CSP permite.

---

## 2. CSP incompatible con Edge Runtime (`src/lib/csp.mjs`, `src/lib/apiPolicy.mjs`)

Al importar `contentSecurityPolicy` desde `apiPolicy.mjs` en el middleware, el Edge Runtime fallaba porque `apiPolicy.mjs` importa `node:crypto` (para generar request IDs del audit log). El Edge Runtime no soporta módulos nativos de Node.

**Qué se hizo:**
- Se creó `src/lib/csp.mjs` con únicamente los directives de CSP y la función `contentSecurityPolicy`, sin ninguna importación — compatible con Edge Runtime.
- `apiPolicy.mjs` ahora re-exporta la función desde `csp.mjs` en lugar de definirla, manteniendo compatibilidad con `next.config.ts` que la importa desde ahí.
- El middleware importa directamente desde `csp.mjs`, sin tocar `apiPolicy.mjs` ni su dependencia en `node:crypto`.
