---
title: "feat: Ingesta autenticada para hub central (reuso máximo de la estructura actual)"
type: feat
status: completed
created: 2026-06-26
depth: standard
target_repo: venezuela-ayuda-repo
---

# feat: Ingesta autenticada para hub central

## Resumen

Tras el terremoto del 24-jun-2026, varios sitios ciudadanos crearon interfaces
de reporte, pero **sus datos no están coordinados**: un reporte en el sitio Y no
aparece en el sitio Z. La decisión: `venezuela-ayuda` es el **hub central** y
todos reportan a nosotros (push). Dejamos de extraer de otros sitios (pull).

**Principio rector: reusar al máximo lo que ya existe. No reinventar, no
reprocesar.** La estructura actual del repo es la canónica:
- Las tablas (`checkins`, `help_requests`, `help_offers`, `damaged_reports`) con
  sus columnas — incluidas `source`/`external_id`/`dedup_key` (migración 0007) —
  son el modelo de datos canónico. Los socios escriben en **esa forma directo**.
- **La lectura ya existe**: las vistas `public_*` servidas por Supabase REST
  (`GET /rest/v1/public_*`, sin teléfonos) son el endpoint de reportes que el
  sitio ya usa (`src/lib/data.ts`). No se construye uno nuevo — solo se documenta.
- La validación ya existe en `src/lib/validation.ts` y se reutiliza tal cual.

Lo único genuinamente nuevo: una **puerta de escritura autenticada** para que un
sitio externo pueda insertar (hoy no puede — las server actions son para los
forms del propio sitio y `0013` revocó la escritura anónima), las **API keys**
que generamos/entregamos, y la **documentación (OpenAPI + Swagger)**.

---

## Frame del problema

- **Hub:** `venezuela-ayuda` es el hub central oficial. Su Supabase/Postgres es la
  única fuente de verdad.
- **Modelo:** **push-only.** Todos reportan vía `POST /api/ingest` con su key. El
  pull (`scripts/ingest.mjs` + workflow) se retira (U9).
- **Escritura:** requiere API key por socio (nosotros la generamos/entregamos).
- **Lectura:** abierta, vía el endpoint que **ya existe** (vistas `public_*` por
  Supabase REST). No se toca.
- **Dedup fuzzy / cross-fuente:** **fuera de alcance** — lo dueña otro equipo.
  Nosotros solo dejamos la data bien estampada (`source`, `dedup_key`).

### Requisitos no negociables de la ingesta

1. **Cerrada por API key.** Ningún write sin `x-api-key` válida → 401. No hay
   ruta de escritura anónima (las server actions son solo para los forms del
   sitio; `0013` revocó el anon).
2. **Atribución obligatoria en TODA fila** (no solo las ingestadas):
   - Vía `/api/ingest`: `source` = identidad del socio, **estampada desde la key,
     nunca desde el body** (no spoofeable).
   - Reportes propios (forms del sitio): `source` = `venezuela-ayuda.com` por
     default de columna (U1) — sin tocar los forms.
   - Reportes scrapeados históricos: conservan su `source` de origen.
   - Regla: **default = nosotros; excepción = plataforma externa con origen
     conocido.** Backfill + default lo garantizan (U1).

---

## La "forma canónica" (no es un contrato nuevo)

Los socios escriben con **los nombres de campo que ya usan las server actions y
las columnas de las tablas** — no se inventa un envelope. Por tipo de reporte,
los campos son los que ya existen en el schema. El endpoint solo añade lo mínimo
para multi-fuente, que **ya son columnas existentes** (0007):

- `external_id` (requerido) — id estable del socio, para idempotencia.
- `source` — **no se manda**; se estampa server-side desde la API key (un socio
  no puede falsificar la fuente de otro).
- `source_url` — link de vuelta al socio.
- contacto/teléfono → va a los campos privados existentes (`phone_private` /
  `contact`); nunca sale por las vistas públicas.

`type` → tabla destino (mapeo 1:1 con lo que ya existe, no reproceso):
`checkin`/`missing` → `checkins`, `help_request` → `help_requests`,
`help_offer` → `help_offers`, `damaged_building` → `damaged_reports`.

---

## Decisiones técnicas clave

### 1. Idempotencia sí; dedup fuzzy NO (otro equipo)

Pregunta abierta ("¿el dedup debe ser async?"). En **nuestro** alcance:
**solo idempotencia exacta en el write.** El dedup cross-fuente/fuzzy queda
fuera — lo dueña otro equipo.

- **Lo que SÍ hacemos:** upsert por `(source, external_id)` → un re-push del mismo
  socio actualiza su propia fila, no duplica. Dos socios distintos reportando a
  la misma persona quedan como dos filas (distinto `source`) — **a propósito no
  se fusiona en el write** (fusionar en caliente arriesga borrar data buena).
- **Lo que damos al equipo de dedup:** seguimos **estampando `dedup_key`**
  (`fuzzyKey(name)`, reusando `scripts/dedup-lib.mjs`) y `source` en cada
  registro. Es "estructurar la data" — nuestra responsabilidad — y es el insumo
  exacto que ellos necesitan. **No corremos ningún proceso de dedup.**

### 2. Reuso máximo en la escritura

`POST /api/ingest` es **delgado**: no transforma, no reinventa.
- Reusa los helpers de `src/lib/validation.ts` (`cleanText`, `cleanOptional`,
  `parseLatLng`, `normalizePhone`) — la misma validación que ya usan las server
  actions.
- Inserta en las **tablas existentes con su forma actual**, vía
  `getServerSupabase()` (service key — alineado con 0013, que dejó la escritura
  solo server-side). Los grants públicos siguen bloqueados.
- Idempotencia vía upsert (`onConflict: "source,external_id"`).

### 3. Lectura = el endpoint que ya existe

No se construye `/api/reports`. La disponibilidad de datos ya está resuelta por
las vistas `public_*` expuestas por Supabase REST (`GET /rest/v1/public_*` con la
publishable key), que es de donde lee el sitio hoy. Solo se **documenta** en el
OpenAPI/README para los socios.

### 4. API keys: hash en reposo, source estampado, gestionadas desde el panel admin

- Tabla `api_partners`: `key_hash` (sha256 hex, no la key en claro), `key_prefix`,
  `source`, `name`, `active`, `created_at`, `revoked_at`, `contact`.
- La key se entrega **una sola vez** al crearla. Formato `va_live_<32B base64url>`.
- Lookup por `key_hash`; `source`/`scopes` salen de la fila (no spoofeables).
- Solo service role accede a la tabla (RLS sin policies, como `admin_emails`).
- **El admin que ya existe en el sitio crea colaboradores y genera las keys**
  desde el panel `/admin` — reusando exactamente el patrón de gestión de admins
  que ya hay (`requireAdmin()`, server actions, `/admin/admins`). No se construye
  un sistema de gestión nuevo; se añade una sección análoga. La key recién creada
  se muestra **una sola vez** en la UI (después solo queda el `key_prefix`).
  El script CLI queda como fallback de ops, diferido.

### 5. OpenAPI escrito a mano, servido + renderizado

Superficie chica. `openapi.yaml` a mano describe `POST /api/ingest` (nuestro) y
referencia el read existente (`/rest/v1/public_*`). Se renderiza con Scalar/
Swagger UI vía CDN en `/docs`. Evita meter Zod + generadores por una ruta.

### 6. Rate limiting: best-effort + tope de batch

Reusa `src/lib/rateLimit.ts` (in-memory, best-effort) por `partnerId` + **tope
duro de tamaño de batch/payload** + idempotencia (reintentos inofensivos) +
moderación (`hidden`). Redis/Upstash diferido hasta ver abuso real.

### 7. Escala: consumo extremo desde múltiples sitios

Restricción dada: la API será **muy consumida** por muchos sitios.

- **La lectura es la carga pesada, y NO pega en nuestra app.** Va por Supabase
  REST sobre las vistas `public_*`, que escala del lado de Supabase e
  independiente de nuestros serverless; cacheable por CDN. **Reusar el endpoint
  existente ya nos da el escalado** (refuerza la Decisión 3).
- **La escritura está acotada** por el nº de socios que pushean. Aun así, dos
  cosas **obligatorias** para no pegarle a Postgres en cada request:
  - **Cache en memoria del lookup de key** (`key_hash → partner`, TTL ~60s).
    Revocación con lag ≤ TTL — aceptable. (U2 lo implementa.)
  - Lookup por el índice único de `key_hash` (U1) — O(log n), no scan.
- **Upsert por lotes** (un round-trip por tabla, no por fila) + tope de batch.
- Rate limit in-memory es por-lambda → débil entre instancias. A esta escala, si
  aparece abuso real, Upstash/Redis deja de ser opcional (diferido hasta esa
  señal; tope de batch + idempotencia son el backstop mientras tanto).

---

## Impacto en el sistema

```
Cliente socio ──(x-api-key + filas canónicas)──▶ POST /api/ingest ─┐
                                                                   │ service key
Cliente socio ──(GET, ya existe)──▶ Supabase REST /rest/v1/public_*│
                                                  ▲                ▼
                                                  │           Supabase Postgres
[PULL RETIRADO: ingest.mjs + ingest.yml]          │ vistas      (tablas existentes)
[DEDUP FUZZY: otro equipo, misma DB]              │ public_*        ▲
                                                  │  (sin tel.)     │ service key
/docs (Swagger) ──▶ public/openapi.yaml           └─────────────────┘
Sitio web actual (Next) ──server actions + data.ts── (sin cambios)
```

- **Nuevo:** 1 ruta (`POST /api/ingest`), 1 página `/docs`, 1 spec OpenAPI, 1
  tabla `api_partners`, 1 script de keys.
- **Reusado tal cual:** tablas, vistas `public_*` (read), `validation.ts`,
  `getServerSupabase`, `rateLimit`, `dedup-lib.mjs`.
- **Se retira:** el pull.
- **Sin cambios** a forms, server actions ni `data.ts` del sitio.

---

## Unidades de implementación

> U3 (envelope/mapeo) y U5 (`/api/reports`) fueron **eliminadas** — reinventaban
> el contrato y la lectura que ya existen. Los U-IDs se conservan con su hueco.

### U1. Migración 0014 — tabla `api_partners` + índices únicos para upsert

**Goal:** Habilitar auth por socio y upsert idempotente sobre las tablas existentes.
**Requirements:** Decisiones 1, 2, 4.
**Dependencies:** ninguna.
**Files:** `supabase/migrations/0014_api_partners.sql`

**Approach:**
- `create table api_partners (id uuid pk default gen_random_uuid(), name text not
  null, source text not null unique, key_hash text unique, key_prefix text,
  scopes text[] not null default '{write}', contact text, active boolean not null
  default true, created_at timestamptz default now(), revoked_at timestamptz)`.
  - `key_hash`/`key_prefix` **nullable**: una fila puede registrarse antes de que
    se le emita su key (caso del seed de abajo).
- `enable row level security` sin policies (solo service role, como `admin_emails`).
- **Seed del colaborador #1 = nosotros.** `insert into api_partners (name, source)
  values ('Venezuela Ayuda', 'venezuela-ayuda.com') on conflict (source) do
  nothing;` (patrón del seed de admin en 0006). Es el `source` por defecto de todo
  reporte propio **y** el colaborador que recibe la **primera API key**.
- **Emitir la primera key** (paso de arranque, fuera del SQL): mintar la key de
  `venezuela-ayuda.com` con el flujo de U8/U2 (`hashKey`) — la migración no puede
  hashear de forma segura. La key en claro se muestra una vez; en la fila queda el
  `key_hash`. (Bootstrap: vía admin U8, o el CLI fallback si el admin aún no está.)
- **Completar columnas multi-fuente en `help_offers`**: `0007` agregó
  `source`/`source_url`/`external_id` a `checkins`, `damaged_reports` y
  `help_requests`, pero **no** a `help_offers`. Agregarlas acá
  (`add column if not exists`). (Misma forma que 0007 — completa el patrón.)
- **Backfill de atribución** en las 4 tablas: `update <t> set
  source='venezuela-ayuda.com', source_url='https://venezuela-ayuda.com' where
  source is null;`. Los reportes orgánicos (forms del sitio) hoy no tienen
  `source` → quedan asignados a nosotros. Los **scrapeados ya traen su `source`
  de origen → no se tocan** (el `where source is null` los respeta).
- **Default para reportes futuros (sin tocar los forms):** `alter table <t> alter
  column source set default 'venezuela-ayuda.com'` (idem `source_url`) en las 4
  tablas. Así un submit orgánico nuevo se atribuye solo; `/api/ingest` setea
  `source` explícito y **sobrescribe** el default. Cero cambios en server actions.
- Índices únicos parciales para upsert: `create unique index ... on checkins
  (source, external_id) where source is not null and external_id is not null;` —
  idem `help_requests`, `help_offers`, `damaged_reports`.
- Terminar con `insert into applied_migrations (version) values ('0014') on
  conflict do nothing;`.

**Patterns to follow:** `supabase/migrations/0006_admin_and_moderation.sql`
(tabla server-only), `0011_migration_tracking.sql` (registro), `0007_external_sources.sql`
(índices parciales sobre external_id).

**Test scenarios:** `Test expectation: none` — DDL. Se verifica con el upsert de U4.

**Verification:** `node scripts/check-migrations.mjs` reporta 0014; existe el
colaborador `venezuela-ayuda.com` y se le emitió la primera key (autentica en
`/api/ingest`); tras el backfill **ningún** reporte tiene `source` null, y los
scrapeados conservan su origen; un insert orgánico nuevo queda con
`source='venezuela-ayuda.com'` por default; un upsert con `(source, external_id)`
repetido no duplica.

---

### U2. Helper de auth por API key — `src/lib/apiAuth.mjs`

**Goal:** Validar `x-api-key` → identidad de socio (`source`, `scopes`) o 401.
**Requirements:** Decisión 4.
**Dependencies:** U1.
**Files:** `src/lib/apiAuth.mjs`, `scripts/apiAuth.test.mjs`

**Approach:**
- `hashKey(raw)` puro: sha256 hex (`node:crypto` / Web Crypto).
- `parsePrefix(raw)`: primeros ~12 chars.
- `authenticatePartner(req, supabase)`: lee `x-api-key`, hashea, busca en
  `api_partners` con `active=true` y `revoked_at is null` vía `getServerSupabase()`;
  devuelve `{ partnerId, source, scopes }` o `null`.
- **Cache en memoria `key_hash → partner` con TTL ~60s** (escala, Decisión 7):
  evita un round-trip a Postgres por request bajo carga alta. Revocación con lag
  ≤ TTL. Mismo patrón de `Map` con expiración que `rateLimit.ts`.
- Separar lo puro (testeable sin DB) de lo async.

**Patterns to follow:** `src/lib/admin.ts` (verificación contra allowlist),
`src/lib/supabase/server.ts`; `.mjs` puro testeable como `scripts/dedup-lib.mjs`.

**Test scenarios:**
- `hashKey` determinística y estable; distinta para keys distintas.
- `parsePrefix` corta a la longitud esperada; no rompe con keys cortas.
- (lookup con mock) key inexistente / `active=false` / `revoked_at` set → `null`;
  key válida → `{source, scopes}`.
- Cache: dos lookups de la misma key dentro del TTL hacen **un** hit a la DB;
  pasado el TTL, vuelve a consultar. Key revocada deja de validar tras expirar.

**Verification:** `node --test scripts/apiAuth.test.mjs` verde.

---

### U4. Ruta `POST /api/ingest` (delgada, reuso máximo)

**Goal:** Puerta de escritura autenticada: el socio envía filas en la forma
canónica; se validan con los helpers existentes y se hace upsert idempotente.
**Requirements:** Forma canónica; Decisiones 1, 2, 6.
**Dependencies:** U1, U2.
**Files:** `src/app/api/ingest/route.ts`

**Approach:**
- `runtime = "nodejs"`. `authenticatePartner` (U2) → 401 si falla; 403 si sin
  scope write. Rate-limit best-effort por `partnerId` (reusar `rateLimit.ts`).
- Body: `{ reports: [...] }` donde cada fila usa **los nombres de campo de las
  tablas / server actions** (sin envelope nuevo). **Tope duro**: máx ~200
  filas/request y límite de payload → 413/400.
- Por fila: `type` → tabla; limpiar con `cleanText`/`cleanOptional`/`parseLatLng`/
  `normalizePhone` de `validation.ts` (la misma validación de las server actions);
  estampar `source` (de la key), `source_url`, `dedup_key` (`fuzzyKey` de
  `dedup-lib.mjs`); contacto → campo privado. **Sin transformación adicional.**
- Validar enums (`category`/`urgency`/`severity`/`status`) contra
  `src/lib/constants.ts`; rechazar inválidos sin abortar el batch.
- Upsert por tabla con `getServerSupabase()`, `onConflict: "source,external_id"`.
- Respuesta 200: `{ accepted, rejected, results: [{external_id, status, error?}] }`.

**Patterns to follow:** `src/app/api/classify/route.ts` (estructura de handler,
rate-limit, errores, `runtime`); `src/app/actions.ts` (qué campos/validación
aplica cada tipo — espejo exacto, no reproceso); `src/lib/validation.ts`.

**Execution note:** empezar con un smoke test del contrato request/response (curl)
antes de cablear el upsert.

**Test scenarios:**
- Sin `x-api-key` → 401; key inválida → 401; sin scope write → 403.
- 2 filas válidas → 200 `upserted`; filas en Supabase con `source` de la key (no
  del body).
- Payload que trae un `source` falso → se ignora; la fila persiste con el `source`
  de la key. (Atribución no spoofeable.)
- Toda fila persistida tiene `source` NOT NULL = el socio autenticado.
- Re-envío del mismo `external_id` → idempotente, sin duplicar (índice de U1).
- Mixto (1 válida + 1 con `type` o enum inválido) → `accepted:1, rejected:1`; la
  válida persiste.
- Batch > tope → 413/400, nada escrito.
- Contacto enviado → en campo privado, **ausente** en `/rest/v1/public_*`.
- Ráfaga del mismo socio → 429 con `Retry-After`.

**Verification:** curl con key de prueba inserta y luego es idempotente; la fila
aparece en `GET /rest/v1/public_*` sin contacto; 429 bajo ráfaga.

---

### U6. Spec OpenAPI + servirlo — `public/openapi.yaml` + `/api/openapi`

**Goal:** Contrato formal de máquina, servido desde el sitio.
**Requirements:** Decisión 5; "documentación".
**Dependencies:** U4.
**Files:** `public/openapi.yaml`, `src/app/api/openapi/route.ts`

**Approach:**
- `openapi.yaml` (3.1): `POST /api/ingest` (security apiKey header `x-api-key`,
  request `{reports:[...]}` con los campos canónicos por tipo, responses
  200/400/401/403/413/429). Sección que **documenta la lectura existente**
  (`GET /rest/v1/public_*` con la publishable key) — no la reimplementa.
- Documentar privacidad (contacto nunca devuelto), idempotencia (`external_id`),
  rate limits, y cómo obtener una key (contacto del operador).
- `/api/openapi` sirve el documento crudo.

**Patterns to follow:** assets en `public/`; handler simple tipo `classify`.

**Test scenarios:** `Test expectation: none` salvo validar que el spec es OpenAPI
válido (lint).

**Verification:** el spec pasa un validador; `curl /api/openapi` lo devuelve; los
paths/campos coinciden con U4 y con las columnas reales de las vistas.

---

### U7. Página de docs `/docs` — visor del spec

**Goal:** Documentación legible para humanos servida desde el sitio.
**Requirements:** Decisión 5; "swagger disponible desde este sitio".
**Dependencies:** U6.
**Files:** `src/app/docs/page.tsx`

**Approach:**
- Página que renderiza el spec con Scalar (un `<script>`) o Swagger UI vía CDN,
  apuntando a `/api/openapi`.
- **Verificar CSP** (`next.config.ts`): si bloquea CDN, auto-hospedar el asset en
  `public/`. Decisión de ejecución.

**Patterns to follow:** páginas en `src/app/*/page.tsx`; `PageShell` si aplica.

**Test scenarios:** `Test expectation: none` (UI estática). Smoke manual: carga,
lista endpoints, "try it" apunta al host correcto.

**Verification:** `/docs` renderiza el endpoint; sin errores de CSP en consola.

---

### U8. Gestión de colaboradores + keys en el panel admin

**Goal:** Que el admin existente del sitio cree colaboradores (socios) y genere/
revoque sus API keys desde `/admin`, reusando el patrón de gestión de admins.
**Requirements:** Decisión 4.
**Dependencies:** U1, U2 (reusa `hashKey`).
**Files:** `src/app/admin/actions.ts` (añadir actions), `src/lib/admin.ts`
(añadir `listPartners`), `src/app/admin/colaboradores/page.tsx`,
`src/components/admin/PartnerManager.tsx`

**Approach:**
- **Server actions** en `src/app/admin/actions.ts`, calcando `addAdmin`/
  `removeAdmin` (gate con `requireAdmin()`, escritura con `getServerSupabase()`):
  - `createPartner({ name, source, contact })`: genera `va_live_<32B base64url>`,
    calcula `key_hash` (reusa U2 `hashKey`) + `key_prefix`, inserta en
    `api_partners`, **devuelve la key en claro una sola vez** (no se guarda).
  - `revokePartner(idOrSource)`: `active=false`, `revoked_at=now()`.
  - (opcional) `regeneratePartnerKey(id)`: revoca y emite nueva.
- **Lectura** en `src/lib/admin.ts`: `listPartners()` → `name`, `source`,
  `key_prefix`, `active`, `created_at` (nunca `key_hash`), calcando `listAdmins()`.
- **UI** `src/app/admin/colaboradores/page.tsx` + `PartnerManager.tsx`: lista de
  colaboradores, form de alta, botón revocar. Al crear, muestra la key **una
  sola vez** con copiar + aviso de que no se vuelve a mostrar. Calca
  `src/app/admin/admins/page.tsx` y `src/components/admin/AdminManager.tsx`.
- Sin migración nueva (la tabla es de U1). Acceso ya protegido por el middleware
  de `/admin` + `requireAdmin()`.

**Patterns to follow:** `src/app/admin/actions.ts` (`addAdmin`/`removeAdmin`,
`requireAdmin`), `src/app/admin/admins/page.tsx`, `src/components/admin/AdminManager.tsx`,
`src/lib/admin.ts` (`listAdmins`).

**Test scenarios:**
- No-admin (sin sesión / fuera de `admin_emails`) invoca `createPartner` → rechazado.
- `createPartner` inserta una fila; la key devuelta hashea al `key_hash` guardado;
  `key_hash`/key cruda **nunca** se persisten en claro ni se vuelven a exponer.
- `listPartners` nunca incluye `key_hash`.
- `revokePartner` deja `active=false` y `revoked_at` no nulo → esa key da 401 en
  `/api/ingest`.

**Verification:** desde `/admin/colaboradores` se crea un colaborador, la key se
muestra una vez y autentica en `/api/ingest`; al revocar, el siguiente request
da 401.

---

### U9. Retirar el pull (y ceder el dedup a otro equipo)

**Goal:** Hub puro — dejar de extraer de sitios hermanos.
**Requirements:** Frame (push-only); Decisión 1 (handoff de dedup).
**Dependencies:** U4 (la write API debe recibir data antes de apagar el pull).
**Files:** `.github/workflows/ingest.yml` (eliminar), `scripts/ingest.mjs` (retirar).

**Approach:**
- Eliminar el workflow `ingest.yml` (pull horario + paso `--dedup`).
- Retirar `scripts/ingest.mjs` (verificar imports antes de borrar; conservar solo
  helpers que algo más use, p.ej. `dedup-lib.mjs`).
- **Coordinar con el equipo de dedup antes de borrar el cron `--dedup`** — hoy es
  el único proceso de dedup; confirmar que ellos ya corren el suyo sobre la misma
  DB o acordar fecha de corte. No tocamos su lógica.

**Patterns to follow:** `.github/workflows/` existentes; `scripts/check-migrations.mjs`
para verificar dependencias.

**Test scenarios:** `Test expectation: none` — retiro de infra. Verificación por ausencia.

**Verification:** el workflow ya no corre; data nueva solo entra por `/api/ingest`;
confirmado el handoff de dedup.

---

## Secuencia y dependencias

```
U1 (migración) ──┬─▶ U2 (auth) ──┬─▶ U4 (POST /ingest) ──┬─▶ U6 (OpenAPI) ─▶ U7 (/docs)
                 │                │                       └─▶ U9 (retirar pull)
                 │                └─▶ U8 (admin: colaboradores + keys)
                 └──────────────────────────────────────┘
```

- **Camino crítico para desbloquear socios:** U1 → U2 → U8 (crear colaborador +
  key desde el admin) → U4 (ya pueden publicar).
- U6/U7 (docs) en paralelo después de U4.
- U9 (apagar pull) al final, con la write API ya recibiendo y previa coordinación
  con el equipo de dedup.
- El **dedup fuzzy queda fuera de alcance.**

---

## Límites de alcance

**En alcance:** puerta de escritura autenticada (`/api/ingest`), API keys (tabla +
gestión desde el panel admin existente), OpenAPI + visor, migración de soporte,
retiro del pull.

### Fuera de alcance — lo dueña otro equipo

- **Dedup fuzzy / cross-fuente.** Solo estampamos `source`/`dedup_key`. Coordinar
  el handoff del cron actual (U9).

### Reusado tal cual (no se reinventa)

- Tablas y columnas existentes (modelo canónico).
- Lectura: vistas `public_*` por Supabase REST (no se construye `/api/reports`).
- Validación: `src/lib/validation.ts`. Cliente: `getServerSupabase`. Rate limit:
  `rateLimit.ts`. Dedup key: `dedup-lib.mjs`.
- **Panel admin existente** (`requireAdmin`, server actions, `/admin/admins`,
  `listAdmins`, middleware de `/admin`) — la gestión de colaboradores/keys calca
  ese patrón (U8), no se construye auth/gestión nueva.
- Forms y `data.ts` del sitio — sin cambios. (Las server actions solo se
  **amplían** con las de colaboradores; las existentes no se tocan.)

### Diferido a follow-up

- Rate limiting distribuido (Upstash/Redis) — solo si aparece abuso.
- Webhooks salientes — por ahora los socios hacen polling de `public_*`.
- Versionado `/api/v1` — si hay un cambio incompatible.
- `scripts/keys.mjs` (CLI de keys) — fallback de ops; la gestión primaria es el
  panel admin (U8).

---

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Rate-limit in-memory débil entre lambdas | Tope de batch/payload + idempotencia + moderación; Redis diferido |
| Socio publica spam/basura | Key revocable (U8) + entra como "fuente externa · sin verificar" + `hidden` |
| Upsert pisa data más rica con más pobre | Conflicto por `(source, external_id)`: solo el dueño re-escribe lo suyo |
| Borrar el pull deja hueco de dedup | Coordinar handoff con el equipo de dedup antes de apagar el cron (U9) |
| CSP de Next bloquea el visor por CDN | Auto-hospedar el asset (check en U7) |
| Key filtrada | Solo hash en reposo; revocación inmediata (U8); prefix para identificar |

---

## Verificación de extremo a extremo

1. Aplicar 0014; `check-migrations.mjs` la reporta.
2. Desde `/admin/colaboradores`, crear un colaborador → key de prueba (mostrada una vez).
3. `curl POST /api/ingest` con la key + 2 filas canónicas → 200 `upserted`;
   reenviar → idempotente.
4. `curl GET /rest/v1/public_*` (endpoint existente) → los 2 registros, **sin** contacto.
5. Revocar el colaborador desde `/admin/colaboradores` → el siguiente `POST` da 401.
6. `/docs` carga y describe el endpoint.
7. `ingest.yml` ya no corre; data nueva solo entra por `/api/ingest`.
