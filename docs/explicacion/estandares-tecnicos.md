# Estándares técnicos y convenciones de código

Convenciones prácticas para contribuir al código. Para la arquitectura del sistema, el modelo de datos y los paths de escritura/lectura ver [`ARCHITECTURE.md`](../../ARCHITECTURE.md).

---

## Stack (referencia rápida)

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions) |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS v4 |
| Base de datos | Supabase (Postgres + PostGIS) |
| Mapa | MapLibre GL |
| i18n | next-intl (ES/EN, sin routing) |
| IA opcional | OpenAI (con fallback heurístico) |
| Deploy | Vercel |

---

## Qué reusar (no reinventar)

Antes de escribir lógica nueva, verificar si ya existe:

| Necesidad | Dónde está |
|---|---|
| Leer datos | `src/lib/data.ts` — **todas** las lecturas pasan por aquí, nunca directo a Supabase |
| Validar / limpiar texto | `src/lib/validation.ts` — `cleanText`, `cleanOptional`, `parseLatLng`, `normalizePhone` |
| Enums y catálogos | `src/lib/constants.ts` — no usar strings mágicos |
| Tipos TypeScript | `src/lib/types.ts` |
| Rate limiting | `src/lib/rateLimit.ts` |
| Auth de admin | `src/lib/admin.ts` — `requireAdmin()`, `listAdmins()` |
| Auth de socios API | `src/lib/apiAuth.mjs` |
| Cliente Supabase (server) | `src/lib/supabase/server.ts` — `getServerSupabase()` |
| Dedup / fuzzy key | `scripts/dedup-lib.mjs` |

---

## Internacionalización

next-intl **sin routing**: el idioma se elige por cookie (`NEXT_LOCALE`), default `es`. No hay `/en/` ni `/es/` en las rutas.

- Mensajes en `messages/{es,en}/` organizados por namespace.
- Al agregar texto nuevo, añadir la clave en **ambos idiomas** (`es` y `en`).
- Los valores de enums (status, category, urgency…) son estables entre locales — no se traducen en el modelo, solo en la UI.

---

## Convenciones de código

- **Sin escritura anónima.** Si un endpoint necesita escribir, usa `getServerSupabase()` con la service key. Los grants anon/authenticated están revocados (migración `0013`).
- **Enums cerrados.** Los valores válidos están en `src/lib/constants.ts`. Rechazar en validación antes de tocar la DB, no dejar que Postgres lance el error.
- **Migraciones:** una responsabilidad por archivo, numeración secuencial (`0001`, `0002`…). **Nunca modificar una migración ya mergeada** — escribir una nueva. Cada archivo termina con el insert en `applied_migrations`.
- **Sin comentarios obvios.** Solo comentar el "¿por qué?" no evidente: una restricción oculta, un workaround, un invariante sutil.
- **Validación en el borde.** Validar en `src/lib/validation.ts` al recibir datos externos (forms, API). No re-validar en capas internas que ya reciben datos limpios.

---

## Atribución de reportes

Cada fila lleva `source` (quién la creó). Es inmutable una vez creada:

- Reportes del sitio propio → `source = 'venezuela-ayuda.com'` (default de columna).
- Reportes de socios → `source` estampado desde la API key, **no desde el body** (no es falsificable).
- El `audit_log` registra quién editó qué — eso es separado de `source`.

---

## Documentación relacionada

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) — forma del sistema, privacidad, migraciones
- [API de ingesta — Hub central](ingesta-api-hub-central.md) — endpoints y diseño del hub
- [Flujo de contribución](../colaboracion/estrategia-de-ramas-y-proteccion.md) — ramas, PRs, QA
