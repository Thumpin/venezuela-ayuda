# Handoff — API de ingesta del hub central (Venezuela Ayuda)

**Para:** equipo de Venezuela Ayuda / sitios hermanos que van a integrar.
**Qué es:** `venezuela-ayuda` pasa a ser el **hub central** de datos del esfuerzo.
Todos los sitios **reportan a nosotros** (push) por una API cerrada con API key;
la lectura usa el endpoint que **ya existe**. Dejamos de extraer (pull) de otros
sitios.

Principio: **reusar la estructura actual del repo (es la canónica), no reinventar,
no reprocesar.**

---

## 1. Modelo en una imagen

```
Sitio socio ─(POST + x-api-key, batch)──▶ POST  /api/v1/reports        ─┐ crear  (audita CREATE)
Sitio socio ─(PATCH + x-api-key)────────▶ PATCH /api/v1/reports/{id}    ─┤ editar (audita UPDATE)
                                          (cerrado por key)             │ service key (RPC atómica)
                                                                        ▼
Sitio socio ─(GET, abierto)──▶ GET /api/v1/reports           ──────────▶ Postgres ──▶ audit_log
Sitio socio ─(GET, abierto)──▶ GET /api/v1/reports/{id}      │ lee public_*  (tablas)    (append-only)
Sitio socio ─(GET, abierto)──▶ GET /api/v1/reports/{id}/history │ proyecta sin PII ◀──────┘
                                  └─▶ (alternativa) Supabase REST /rest/v1/public_*

Dedup fuzzy / cross-fuente  →  lo dueña OTRO equipo (fuera de esta API).
```

Recurso único: **`reports`**. El `id` (uuid global) es la identidad estable; el
`type` es **discriminador del payload/respuesta, NUNCA va en la ruta**.

- **Escritura:** crear por `POST /api/v1/reports`, modificar por `PATCH
  /api/v1/reports/{id}` — ambos **cerrados por API key** (scope `write`). No hay
  escritura anónima. Cada mutación es **atómica con su registro de auditoría**
  (RPC plpgsql: mutación + insert al audit en la misma transacción).
- **Atribución:** toda fila lleva `source` = identidad del socio, **estampada
  desde la key** (no se confía en el body → no es falsificable). En PATCH el
  `source`/`external_id`/`id` son **inmutables**: el creador original se preserva;
  el editor solo queda registrado en el audit log.
- **Trazabilidad:** todo CREATE/UPDATE deja un evento inmutable y atribuible en
  `audit_log` (append-only). Consultable, proyectado sin PII, por `GET
  /api/v1/reports/{id}/history`.
- **Lectura:** abierta, sin key. `GET /api/v1/reports` (colección, cursor
  estable) y `GET /api/v1/reports/{id}` (un reporte). El acceso directo a Supabase
  REST (`/rest/v1/public_*`) queda como alternativa. Todas leen las vistas
  `public_*` — sin teléfonos ni contactos.

---

## 1.1 Escritura interna auditada (nuestra plataforma como socio)

El hub tenía dos mundos de escritura desacoplados: el **API externo** (socios)
escribía vía las RPC atómicas → auditado y atribuido; pero la **escritura interna**
del sitio (los server actions de `src/app/actions.ts` y `src/app/admin/actions.ts`)
escribía **directo** a las tablas (`.from(t).insert/update/delete`) → **sin
audit_log** y sin partner atribuido.

A partir de la migración `0018`, **toda escritura interna pasa por las MISMAS RPC**
(`ingest_reports` / `patch_report` / `delete_report`) que usa el API externo,
atribuida a **nuestra propia plataforma como un socio más**:

- **Somos el socio `venezuela-ayuda.com`**, con un **id FIJO**:
  `11111111-1111-4111-8111-111111111111`. Vive en el seed de `0015`
  (`api_partners`) y en `src/lib/canonical.mjs` (`VA_PARTNER_ID` / `VA_SOURCE`) —
  única fuente de verdad, sin leer la DB para resolver el partner_id.
- Cada server action arma la fila/patch ya validado y llama la RPC con
  `p_partner = VA_PARTNER_ID`, `p_source = VA_SOURCE`. El contexto forense
  (`request_id`/`ip`/`user_agent`) va `null` (un server action no tiene `Request`).
  El armado de parámetros es puro y testeado en `src/lib/internalWrite.mjs`.
- Resultado: **toda mutación —interna o externa— deja su evento en `audit_log`**
  (CREATE/UPDATE/DELETE), atribuible y reversible igual.

Dos extensiones en `0018` para cubrir TODO el CRUD interno:

- **`collection_centers`** entra en `ingest_reports`/`patch_report`. La tabla **no
  tiene `external_id`** ni el conflict target `(source, external_id)` de las 4
  tablas de reporte → su insert es **simple por id** (cada postulación es fila
  nueva, sin upsert idempotente); el update por id ya era genérico. Ojo: su columna
  `source` mantiene su semántica propia (`'seed'|'user'`) — la atribución del actor
  (`venezuela-ayuda.com`) viaja en el evento de audit, no en la fila.
- **`DELETE`**: el admin borra de verdad reportes y centros. Nueva RPC
  `delete_report` que captura el snapshot `before`, borra, y audita `action=DELETE`
  (`after=null`) en la misma transacción. Cubre las 4 tablas de reporte +
  `collection_centers`.

Sin cambios en el **API externo** ni en el contrato OpenAPI: esto es interno.

---

## 2. Esquema que proponemos

No cambiamos las tablas existentes. Solo agregamos:

### 2.1 Tabla nueva: `api_partners` (registro de socios + keys)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | nombre legible del socio ("Cruz Roja") |
| `source` | text **unique** | identificador del socio que se estampa en cada fila ("cruzroja.org") |
| `key_hash` | text unique **nullable** | sha256 de la API key (nunca en claro). Null mientras no se le haya emitido key todavía |
| `key_prefix` | text nullable | primeros chars, para identificar la key sin revelarla |
| `scopes` | text[] | default `{write}` |
| `contact` | text | a quién contactar del socio |
| `active` | boolean | default true |
| `created_at` | timestamptz | |
| `revoked_at` | timestamptz | set al revocar |

Solo el service role accede a esta tabla (RLS sin policies).

### 2.2 Completar columnas multi-fuente en `help_offers`

La migración `0007` agregó `source` / `source_url` / `external_id` a `checkins`,
`damaged_reports` y `help_requests`, pero **no** a `help_offers`. Se las
agregamos para poder ingestar ofertas con atribución e idempotencia.

### 2.3 Índices únicos para idempotencia

`UNIQUE (source, external_id)` (parcial, donde ambos no son null) en `checkins`,
`help_requests`, `help_offers`, `damaged_reports`. Esto permite **upsert**: si un
socio reenvía el mismo `external_id`, se actualiza su fila en vez de duplicar.

### 2.4 Primer colaborador + atribución de todo reporte

La migración `0015` también:
- **Crea el colaborador #1 = nosotros**: `Venezuela Ayuda` / `source =
  venezuela-ayuda.com`, y se le emite la **primera API key**. (Nuestros reportes
  orgánicos siguen entrando por los forms con `source` por default; la key nos
  hace colaborador de primera clase y habilita usar la API también.)
- **Backfill**: a todo reporte existente **sin** `source` (los orgánicos del
  sitio) le asigna `source = venezuela-ayuda.com`. Los reportes **scrapeados ya
  traen su `source` de origen → no se tocan.**
- **Default a futuro**: `source` por default = `venezuela-ayuda.com` en las 4
  tablas, así los reportes orgánicos nuevos se atribuyen solos sin cambiar los
  forms. `/api/v1/ingest` setea el `source` del socio y sobrescribe el default.

Regla de atribución: **default = Venezuela Ayuda; excepción = plataforma externa
con origen conocido.**

> Todo lo anterior va en **una sola migración: `0015_api_partners.sql`**.

---

## 2.5 Catálogo de `type` (los 5 valores → tabla/vista)

`type` es un **conjunto cerrado de 5 valores** — el catálogo del hub. Es el mismo
en escritura (`POST /api/v1/reports`, campo del reporte) y en lectura
(`GET /api/v1/reports`, parámetro requerido). Cada valor mapea a una tabla/vista
concreta:

| `type` | Qué es | Tabla (escritura) | Vista (lectura, sin PII) |
|---|---|---|---|
| `missing_person` | Persona desaparecida / se busca | `checkins` (status `LOOKING_FOR_SOMEONE`) | `public_checkins` filtrando `status=LOOKING_FOR_SOMEONE` |
| `checkin` | "Estoy a salvo" / "necesito ayuda" | `checkins` (status `SAFE`/`NEEDS_HELP`) | `public_checkins` filtrando `status in (SAFE, NEEDS_HELP)` |
| `help_request` | Solicitud de ayuda (médica, agua, rescate…) | `help_requests` | `public_help_requests` |
| `help_offer` | Oferta de ayuda / recursos disponibles | `help_offers` | `public_help_offers` |
| `damaged_building` | Edificio o estructura dañada | `damaged_reports` | `public_damaged_reports` |

`missing_person` y `checkin` **comparten la tabla/vista `checkins`** y se separan
por `status` — por eso son dos `type` distintos aunque vivan en la misma vista.
Cualquier otro valor de `type` se rechaza (fila rechazada en escritura, 400 en
lectura).

---

## 3. Endpoints

### 3.1 Crear — `POST /api/v1/reports` (cerrado por API key)

> Renombrado desde `POST /api/v1/ingest` (sin alias — no había consumidores aún).
> Misma lógica: validación + ruteo por `type`, MAX 200/lote, idempotencia upsert
> por `(source, external_id)`, fail-closed (401/403/413/429/503). Lo NUEVO: la
> escritura va por un RPC `ingest_reports` que hace **upsert + audit CREATE de
> cada fila en una sola transacción** (atómico por tabla → se preserva el
> éxito-parcial-por-tabla).

**Headers**
```
x-api-key: va_live_xxxxxxxxxxxxxxxxxxxxxxxx     # requerido
Content-Type: application/json
```

**Body** — lote de filas en la **forma canónica** (los mismos campos de las
tablas; no hay envelope nuevo). Máx ~200 filas por request.

```jsonc
{
  "reports": [
    {
      "type": "missing_person",          // → tabla checkins (status LOOKING_FOR_SOMEONE)
      "external_id": "cruzroja:1023",     // requerido — tu id estable (idempotencia)
      "source_url": "https://cruzroja.org/r/1023",
      "name": "Juan Pérez",
      "city": "Caracas",
      "place_name": "Los Palos Grandes",
      "latitude": 10.503, "longitude": -66.844,
      "message": "Visto por última vez el 24/06",
      "photo_url": "https://...",
      "contact": "+58412..."              // PRIVADO — se guarda, NUNCA se devuelve
    },
    {
      "type": "help_request",             // → tabla help_requests
      "external_id": "cruzroja:req-77",
      "category": "medical",              // medical|food|water|shelter|transportation|electricity|rescue|tools
      "urgency": "CRITICAL",              // LOW|MEDIUM|HIGH|CRITICAL
      "description": "Persona atrapada, sin oxígeno",
      "city": "La Guaira", "latitude": 10.6, "longitude": -66.93,
      "contact": "+58414..."
    },
    {
      "type": "damaged_building",         // → tabla damaged_reports
      "external_id": "cruzroja:b-9",
      "place_name": "Edificio Aurora",
      "severity": "COLLAPSE_RISK",        // PARTIAL|CRACKS|COLLAPSE_RISK|COLLAPSED
      "description": "Grietas estructurales en columnas",
      "city": "Caracas", "latitude": 10.49, "longitude": -66.85,
      "photo_url": "https://..."
    },
    {
      "type": "help_offer",               // → tabla help_offers
      "external_id": "cruzroja:o-3",
      "category": "transportation",       // transportation|food|shelter|medical|supplies|translation
      "description": "2 camionetas disponibles",
      "city": "Maiquetía", "latitude": 10.6, "longitude": -66.98,
      "availability": "8am-6pm",
      "contact": "+58416..."
    },
    {
      "type": "checkin",                  // → tabla checkins (estoy a salvo)
      "external_id": "cruzroja:c-50",
      "name": "María R.",
      "status": "SAFE",                   // SAFE|NEEDS_HELP|LOOKING_FOR_SOMEONE
      "city": "Valencia"
    }
  ]
}
```

Reglas:
- `external_id` es **requerido** (sin él no hay idempotencia).
- `source` y `source_url`: **no mandes `source`**, lo estampamos desde tu key.
  `source_url` sí lo mandas (link de vuelta a tu registro).
- `contact` / teléfono → se guarda en campo privado, **nunca** sale por lectura.
- Coordenadas fuera del bounding box de Venezuela se descartan (no rompen la fila).

**Respuesta `200`**
```jsonc
{
  "accepted": 4,                          // filas escritas (upserted)
  "rejected": 1,                          // rechazos de validación (permanentes — no reintentar)
  "errored": 0,                           // fallos de DB (transitorios — reintentar esas filas)
  "results": [
    { "external_id": "cruzroja:1023", "status": "upserted", "report_id": "8f3a…" },
    { "external_id": "cruzroja:req-77", "status": "upserted", "report_id": "1c92…" },
    { "external_id": "cruzroja:b-9", "status": "upserted", "report_id": "a07e…" },
    { "external_id": "cruzroja:o-3", "status": "upserted", "report_id": "d4b1…" },
    { "external_id": "cruzroja:x", "status": "rejected", "error": "type inválido" }
  ]
}
```

**Éxito parcial dentro de un 200 — el cliente DEBE reconciliar fila por fila.**
El upsert es **por tabla** (un round-trip por tabla). Por eso un error de DB en
**una** tabla marca **todas** las filas de esa tabla como `status:error`, mientras
las filas de **otras** tablas del mismo lote pueden quedar `upserted`. O sea: un
mismo lote puede salir con parte `upserted` y parte `error` — y aun así el HTTP es
**200**. No asumas que 200 = todo escrito.

- Reconciliá `results` **fila por fila usando tu `external_id`**: reintenta solo
  las `error` (transitorias); las `rejected` son permanentes (no reintentar, corregí
  el dato); las `upserted` ya quedaron.
- `report_id` es el id canónico del hub del reporte; viene **solo** en las filas
  `upserted` (no en `rejected`/`error`). Es estable: re-postear el mismo
  `external_id` devuelve el mismo `report_id` (upsert idempotente).
- `accepted` / `rejected` / `errored` son los conteos agregados de esos tres estados.
- El HTTP **503** se devuelve **solo cuando toda la escritura falló** (nada
  aceptado) — ahí reintentá el lote completo.

**Códigos de error**
| Código | Causa |
|---|---|
| 401 | falta `x-api-key` o es inválida/revocada |
| 403 | la key no tiene scope `write` |
| 400 | body inválido |
| 413 | lote excede el tope |
| 429 | rate limit (incluye `Retry-After`) |
| 503 | toda la escritura falló (nada aceptado) — reintentá el lote completo |

### 3.2 Lectura — `GET /api/v1/reports` (vía recomendada, abierto, sin PII)

Lectura **abierta, sin API key** (para maximizar difusión). Lee de las vistas
`public_*` (nunca de las tablas crudas) → `phone_private`/`contact` **nunca** se
exponen. Un solo host, sin manejar la publishable key, con cursor estable.

```
GET /api/v1/reports?type=help_request&limit=100
GET /api/v1/reports?type=checkin&city=Caracas&since=2026-06-26T10:00:00Z|<uuid>
```

Parámetros:

| Param | Req | Nota |
|---|---|---|
| `type` | **sí** | uno de los 5 del catálogo (§2.5). `missing_person`/`checkin` salen de la misma vista, separados por status. Inválido/ausente → 400 |
| `since` | no | cursor de la página anterior (`next_cursor`): `created_at|id`. Trae filas posteriores. También acepta un timestamp ISO pelón |
| `limit` | no | default 100, máx 500. Inválido → default |
| `city` | no | filtro parcial por ciudad (case-insensitive, substring) |

**Paginación por cursor estable:** orden `created_at` asc con desempate por `id`.
La respuesta trae `next_cursor`; pasalo como `since` para la siguiente página.
`next_cursor` es `null` cuando ya no hay más filas.

```jsonc
{ "reports": [ /* filas de la vista del type, sin PII */ ], "next_cursor": "2026-06-26T10:00:00Z|<uuid>" }
```

#### Alternativa: acceso directo a Supabase REST (`GET /rest/v1/public_*`)

Sigue disponible para quien lo prefiera, pero `GET /api/v1/reports` es la vía
recomendada (un host, sin publishable key, cursor estable). El acceso directo:

```
GET {SUPABASE_URL}/rest/v1/public_help_requests?select=*&order=created_at.desc
Header: apikey: {PUBLISHABLE_KEY}      # la pública sb_publishable_..., ya expuesta
```

Vistas disponibles y sus campos:

| Vista | Campos expuestos |
|---|---|
| `public_checkins` | id, name, status, city, latitude, longitude, message, photo_url, created_at, found_at, place_name, **source, source_url** |
| `public_help_requests` | id, category, description, urgency, city, latitude, longitude, status, created_at, place_name, items, **source, source_url** |
| `public_help_offers` | id, category, description, city, latitude, longitude, availability, available, created_at |
| `public_damaged_reports` | id, place_name, description, severity, city, latitude, longitude, photo_url, status, created_at, verified_at, verified_by, **source, source_url**, risk_level, risk_priority |

Paginación/filtros: los nativos de PostgREST (`limit`, `offset`/`Range`,
`created_at=gt.<cursor>`, `order=`, etc.). **Nunca** se exponen `phone_private`
ni `contact`.

### 3.3 Leer un reporte — `GET /api/v1/reports/{id}` (abierto, sin PII)

Lectura abierta de **un** reporte por su `id` global (uuid). El `id` se resuelve
entre las 4 vistas `public_*`; la respuesta añade el campo `type` (discriminador).
Reportes moderados (ocultos) → 404.

```
GET /api/v1/reports/8f3a…-uuid
→ 200 { "report": { "type": "help_request", "id": "8f3a…", "category": "medical", … } }
→ 400 si el id no es un uuid · 404 si no existe (o está oculto)
```

### 3.4 Modificar — `PATCH /api/v1/reports/{id}` (cerrado por API key)

Modificación parcial, cerrada por API key (scope `write`). **Edición
cross-cliente PERMITIDA** (el hub es colaborativo): cualquier socio puede editar
cualquier reporte. La seguridad no la da prohibir la edición, sino el **audit log
inmutable y atribuible** (§3.6) — quién editó qué queda registrado para siempre,
y habilita revertir acciones de un socio malicioso (la herramienta de reversión
es un trabajo aparte).

```
PATCH /api/v1/reports/8f3a…-uuid     (x-api-key requerido)
{ "status": "RESOLVED", "urgency": "LOW" }      // solo los campos a cambiar
→ 200 { "report": { "type": "help_request", …, "status": "RESOLVED" } }
```

Reglas:
- **Inmutables** → 400 si se intentan cambiar: `id`, `source`, `external_id`. El
  creador original se **preserva**; el editor solo queda en el audit.
- Solo se aceptan **campos mutables** del `type` (status, severity, available,
  found_at, description, category, urgency, coords, place_name, contact, …). Un
  campo desconocido/no-modificable → 400.
- El `type` en el body es **opcional** y solo confirma el discriminador: si se
  envía, debe coincidir con el type real del `id`. El `id` determina el reporte;
  no se reclasifica por la ruta.
- A diferencia del POST (que **clampa** valores laxos a un default), el PATCH
  **rechaza** enums/coordenadas inválidos con 400 — una edición explícita inválida
  es un error del cliente, no algo que adivinar. Las coords requieren `latitude` y
  `longitude` juntas, dentro del bounding box VE.
- `contact` se acepta (se guarda en el campo privado, nunca se devuelve por lectura).
- Atómico con el audit: la modificación va por un RPC `patch_report` que hace
  `UPDATE` + insert al audit (before/after completos) en la misma transacción.

| Código | Causa |
|---|---|
| 400 | id no-uuid, body inválido, campo inmutable/no-modificable, o valor inválido |
| 401 | falta `x-api-key` o es inválida/revocada |
| 403 | la key no tiene scope `write` |
| 404 | no existe un reporte con ese id |
| 429 | rate limit (`Retry-After`) |
| 503 | falla de servicio/DB — reintentá |

### 3.5 Historial — `GET /api/v1/reports/{id}/history` (abierto, proyectado)

Rastro de auditoría de un reporte, en **orden cronológico inmutable**. Abierto
(sin key) pero **proyectado**: solo `action`, `occurred_at`, `source` y los
**campos públicos que cambiaron** (`from`→`to`). NUNCA expone PII
(`contact`/teléfonos/`manage_token`/`risk_answers`) ni forense (`ip`/`user_agent`)
— eso vive solo en el audit log interno. Un reporte sin mutaciones por la API
(orgánico/preexistente) devuelve `history` vacío.

```
GET /api/v1/reports/8f3a…-uuid/history
→ 200 {
    "id": "8f3a…",
    "history": [
      { "action": "CREATE", "occurred_at": "2026-06-26T10:00:00Z", "source": "cruzroja.org",
        "changes": { "category": { "from": null, "to": "medical" }, "status": { "from": null, "to": "OPEN" } } },
      { "action": "UPDATE", "occurred_at": "2026-06-26T14:30:00Z", "source": "proteccioncivil.gob.ve",
        "changes": { "status": { "from": "OPEN", "to": "RESOLVED" } } }
    ]
  }
```

### 3.6 Audit log + trazabilidad (capacidad core)

Toda mutación por la API deja un registro en `audit_log` — tabla **append-only**:

- `seq` (bigint identity) = orden total inmutable; `occurred_at`; `partner_id`
  (QUIÉN, de la key) + `source` (snapshot); `action` (`CREATE`|`UPDATE`|`HIDE`);
  `resource_table`/`resource_id`/`external_id`; `before`/`after` = **snapshot
  COMPLETO** (interno, puede incluir PII); `request_id`/`ip`/`user_agent`.
- **Append-only forzado en la DB**: RLS on, sin policies de update/delete, y
  `revoke update, delete … from anon, authenticated`. Nadie reescribe la historia.
- **Atómico con la mutación**: el insert al audit y la mutación del reporte van en
  la **misma transacción**, vía funciones plpgsql RPC (`ingest_reports`,
  `patch_report`) que el endpoint llama con el service key. Se eligió RPC sobre
  triggers+GUC porque el actor (partner/source/request_id/ip/ua) viaja como
  parámetro explícito — imposible de omitir y sin fragilidad de GUCs sobre el
  pooling de PostgREST. (Las funciones tienen `execute` revocado a anon/
  authenticated: solo el service role las invoca.)
- El `before`/`after` completo es **interno/admin**. La vista pública del rastro
  (`GET /{id}/history`) proyecta solo campos públicos que cambiaron.
- Habilita (a futuro, otro PR) **revertir** acciones de un socio malicioso — acá
  solo se deja el cimiento append-only que lo hace posible.

> Migración: `supabase/migrations/0016_audit_log.sql`.

---

## 4. API keys (las crea el admin del sitio)

- Formato: `va_live_<32 bytes base64url>`. Se muestra **una sola vez** al crearla.
- Guardamos solo el **hash** (sha256). Si se pierde, se revoca y se emite otra.
- Cada key está atada a un `source` único → identifica al socio en cada fila.

**Gestión desde el panel admin existente** (`/admin/colaboradores`): el admin del
sitio crea un colaborador (nombre + identificador/`source` + contacto), el sistema
genera la key y la **muestra una sola vez** (copiar y entregar). Desde ahí mismo se
listan y se revocan. Reusa el mismo login/allowlist de admins que ya existe — no
hay sistema de gestión nuevo. (Hay un CLI de respaldo para ops, pero no es la vía
primaria.)

Para integrar a un socio: el admin lo da de alta en el panel y le entrega su key.

---

## 5. Documentación que se sirve desde el sitio

- **OpenAPI 3.1**: `public/openapi.yaml`, servido crudo en `GET /api/openapi`.
  Describe `POST /api/v1/reports`, `GET /api/v1/reports`, `GET|PATCH
  /api/v1/reports/{id}`, `GET /api/v1/reports/{id}/history` (+ el schema
  `AuditEventPublic` de un evento de audit), y referencia el acceso directo a
  `public_*` como alternativa.
- **Swagger / Scalar UI**: página `/docs` que renderiza el spec — para que un
  integrador lea el contrato y pruebe llamadas.

---

## 6. Fuera de alcance (para coordinar con el otro equipo)

- **Dedup fuzzy / cross-fuente** (mismo "Juan Pérez" desde dos socios) lo dueña
  **otro equipo**. La ingesta `/api/v1/ingest` **no hace dedup**: solo idempotencia
  exacta por `(source, external_id)`. Nosotros dejamos cada fila estampada con
  `source` y `dedup_key` (`fuzzyKey(name)`) — el insumo que ellos necesitan.
- **El pull (scrape de sitios hermanos) se retiró → el hub es push-only.** PERO el
  **cron de dedup cross-fuente se conserva**: corre cada hora vía el workflow
  `.github/workflows/ingest.yml` (ahora llamado "Dedup cleanup"), que ejecuta
  `node scripts/ingest.mjs --dedup`. Se quitó el paso de scrape; el cron de dedup
  **no se borra**. Sigue corriendo hasta que un proceso de dedup dedicado de otro
  equipo lo reemplace — ahí se coordina el corte para no dejar ventana sin dedup.

---

## 7. Resumen de lo que se construye (de nuestro lado)

| # | Entregable | Tipo |
|---|---|---|
| 1 | Migración `0015` — `api_partners` + columnas en `help_offers` + índices únicos | DB |
| 1b | Migración `0016` — `audit_log` append-only + RPC atómicas `ingest_reports`/`patch_report` | DB |
| 1c | Migración `0018` — escritura interna por las mismas RPC: `collection_centers` + `delete_report` (action DELETE), socio propio con id fijo | DB |
| 2 | Auth por API key (hash + lookup) | backend |
| 3 | `POST /api/v1/reports` (cerrado por key, upsert idempotente, atribución `source`, audita CREATE) | endpoint |
| 3b | `PATCH /api/v1/reports/{id}` (cerrado por key, audita UPDATE) + `GET /{id}` + `GET /{id}/history` | endpoint |
| 4 | `GET /api/v1/reports` (lectura abierta sin PII, cursor estable, vía recomendada) | endpoint |
| 5 | OpenAPI + `/docs` (Swagger) | docs |
| 6 | Gestión de colaboradores + keys en el panel admin existente (`/admin/colaboradores`) | admin UI |
| 7 | Quitar el paso de scrape (pull) — **conservar** el cron de dedup en `.github/workflows/ingest.yml` ("Dedup cleanup") | cleanup |

Lectura: la vía recomendada es `GET /api/v1/reports` (entregable #4); el acceso
directo a las vistas `public_*` por Supabase REST queda como alternativa. Ambas
leen las mismas vistas, sin PII.

Plan técnico completo: [docs/adr/0001-feat-data-exchange-api.md](../adr/0001-feat-data-exchange-api.md).
