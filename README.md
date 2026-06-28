# Venezuela Ayuda 🇻🇪

Plataforma comunitaria de coordinación de emergencia tras el terremoto en
Venezuela. Ayuda a las personas a reencontrarse con sus familiares, reportar y
encontrar necesidades, y ver la situación en un mapa — **sin necesidad de
cuenta**, en **español**, y optimizada para **móviles y conexiones lentas**.

🌐 **[venezuela-ayuda.com](https://venezuela-ayuda.com)**

## Qué hace

- **🔎 Buscar o reportar personas desaparecidas** — busca por nombre, edificio o
  ciudad, o crea un reporte. Cada reporte tiene un enlace privado para marcar a la
  persona como encontrada.
- **✅ Estoy a salvo** — avisa a tu familia que estás bien.
- **🆘 Necesito ayuda** — solicita ayuda (médica, agua, comida, refugio, rescate,
  herramientas…) con ubicación, urgencia y cantidades.
- **🤝 Puedo ayudar** — ofrece transporte, comida, refugio, suministros, etc.
- **🏚️ Reportar edificio dañado** — reporta daños estructurales con gravedad,
  ubicación y foto.
- **🗺️ Mapa de ayuda** — todo en un mapa interactivo: necesidades, desaparecidos,
  voluntarios, centros de acopio y edificios dañados, con filtros.

## Cómo cuida los datos

- **Privacidad primero:** los teléfonos y contactos se guardan pero **nunca** se
  muestran públicamente.
- **Sin cuenta para el público:** reportar y buscar no requiere registrarse.
- **Moderación:** un panel de administración permite verificar reportes y ocultar
  o eliminar contenido falso o duplicado.
- **Fuentes externas:** integra y atribuye información de otros esfuerzos
  ciudadanos, marcándola como "fuente externa · sin verificar".

## Para desarrolladores

Documentación útil para colaborar:

- [`ARCHITECTURE.md`](ARCHITECTURE.md): mapa del backend, API, Supabase y privacidad.
- [`AGENTS.md`](AGENTS.md): reglas para agentes de código y automatizaciones.
- [`docs/OPEN_SOURCE_FORKING.md`](docs/OPEN_SOURCE_FORKING.md): cómo este PR complementa la capa de colaboración propuesta en #33.

El flujo de contribución, seguridad, templates, CODEOWNERS, labels y gobernanza
se mantienen en el PR de colaboración #33 para evitar duplicar reglas operativas.
Los PRs normales deben apuntar a `staging`; la app de revisión está en
[venezuela-ayuda-staging.vercel.app](https://venezuela-ayuda-staging.vercel.app/).

### Stack

Next.js 16 (App Router · Server Components · Server Actions) · TypeScript ·
Tailwind CSS v4 · Supabase (Postgres + PostGIS) · MapLibre GL · next-intl (ES/EN) ·
OpenAI (opcional) · desplegado en Vercel.

### Estructura del proyecto

```
src/app/          rutas: /, buscar, mapa, a-salvo, necesito-ayuda, puedo-ayudar,
                  reportar-edificio, ayudar-fuera, solicitudes, persona/[id],
                  solicitud/[id], edificio/[id], galeria, admin, api/classify
src/components/   UI; src/components/forms/ (formularios), admin/ (moderación)
src/lib/          data.ts (todas las lecturas vía vistas public_*), constants,
                  types, validation, risk, dedup/people, helpAbroad, koboBuildings,
                  supabase/{server,auth}, i18n/{config,request,actions}
supabase/migrations/  esquema (0001..) — fuente de verdad
scripts/          ingest.mjs (fuentes externas), dedup-lib.mjs, backup-db.mjs,
                  apply/check-migrations
messages/{es,en}/ traducciones por namespace (next-intl)
```

### Esquema de datos

Tablas: `checkins` (personas), `help_requests`, `help_offers`, `damaged_reports`,
`collection_centers` (centros de acopio), `sightings` + `request_responses`
(relay de contacto), `admin_emails`, `applied_migrations`. Cada tabla tiene una
columna generada `location geography(Point,4326)`. Enums para estado / categoría /
urgencia / gravedad.

Los clientes **solo** leen las vistas `public_*`, que **excluyen** los campos
privados (`phone_private`, `contact`, `manage_token`, contactos de relay).

### Privacidad y seguridad

- **Los contactos nunca son públicos.** Se guardan en campos privados que las
  vistas públicas omiten. Para conectar a desconocidos se usa un **patrón de
  relay**: quien responde deja su propio contacto y solo quien reportó lo lee
  mediante un `manage_token` secreto.
- **Escrituras solo de servidor:** todos los inserts/updates usan la *service key*
  (server-only); RLS habilitado en todas las tablas y los grants de escritura
  revocados para `anon`/`authenticated` (defensa en profundidad).
- **Admin** protegido por Supabase Auth + lista `admin_emails`. Los server actions
  tienen rate limit y honeypots.

### Fuentes externas e ingesta

`scripts/ingest.mjs` integra datos de otros esfuerzos ciudadanos (los marca como
*fuente externa · sin verificar*), geocodifica ubicaciones de texto libre y
**deduplica** por `dedup_key = nombre + región` (`personKey`): homónimos en
regiones distintas se conservan; reportes repetidos de la misma persona en la misma
zona se colapsan. Idempotente por `external_id`. Tests en
`scripts/dedup-lib.test.mjs`.

### Internacionalización

next-intl **sin routing** — el idioma se elige por cookie (`NEXT_LOCALE`, default
`es`). Mensajes por namespace en `messages/{es,en}/`.

### Desarrollo local

```bash
npm install
# crea .env.local con NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# y SUPABASE_SECRET_KEY (opcional: OPENAI_API_KEY, NEXT_PUBLIC_GA_ID, etc.)
supabase start  # API local en http://127.0.0.1:54331, DB en 127.0.0.1:54332
npm run dev      # http://localhost:3000
npm run lint
npm run build
node --test scripts/dedup-lib.test.mjs
```

### Tipos de Supabase

`src/types/database.types.gen.ts` es un archivo **generado por Supabase CLI**. No
se edita a mano: la fuente de verdad del esquema son las migraciones en
`supabase/migrations/` y la base de datos que introspecta el CLI. El archivo se
commitea para que TypeScript funcione después de clonar el repo.

Después de crear o cambiar migraciones, regenera los tipos:

```bash
# Contra la base local levantada con `supabase start`.
npm run types:dev

# Contra un proyecto ya linkeado con `supabase link`.
npm run types:linked

# Contra un proyecto hosted sin guardar el ref en el repo.
SUPABASE_PROJECT_ID=xxxxxxxxxxxxxxxxxxxx npm run types:prod
```

Si `types:dev` falla con `supabase/config.toml not found`, ejecuta
`supabase init` una vez. Si falla porque los puertos `54321`-`54324` están en uso,
este repo ya trae `supabase/config.toml` configurado para usar `54331`-`54334`.

### Migraciones y backups

- Las migraciones SQL viven en `supabase/migrations/` y se **auto-aplican** al
  hacer push a `main` (GitHub Action, vía el secret `SUPABASE_DB_URL`). Se rastrean
  en `applied_migrations`; cada archivo nuevo se auto-registra con su versión.
- `node scripts/backup-db.mjs` genera un backup JSON local de todas las tablas en
  `backups/` (en `.gitignore` — contiene datos privados, **nunca** se commitea).

## Contribuir

Este es un proyecto comunitario y sin fines de lucro. Si quieres colaborar
—desarrollo, datos, difusión o verificación de información— escríbenos a
**[hola@maw.dev](mailto:hola@maw.dev)**.

Hecho con cariño para Venezuela. 🇻🇪
