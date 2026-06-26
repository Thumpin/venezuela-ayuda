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
`sightings` + `request_responses` (relay de contacto), `admin_emails`,
`applied_migrations`. Cada tabla tiene una columna generada `location
geography(Point,4326)`. Enums para estado / categoría / urgencia / gravedad.

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
npm run dev      # http://localhost:3000
npm run lint
npm run build
node --test scripts/dedup-lib.test.mjs
```

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
