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
Sitio socio ──(POST + x-api-key, filas canónicas)──▶  POST /api/ingest  ─┐
                                                       (cerrado por key)  │ service key
                                                                          ▼
Sitio socio ──(GET, abierto, ya existe)──▶ Supabase REST /rest/v1/public_* ──▶  Postgres
                                                  (vistas sin teléfonos)        (tablas actuales)

Dedup fuzzy / cross-fuente  →  lo dueña OTRO equipo (fuera de esta API).
```

- **Escritura:** solo por `POST /api/ingest`, **cerrada por API key**. No hay
  escritura anónima.
- **Atribución:** toda fila lleva `source` = identidad del socio, **estampada
  desde la key** (no se confía en el body → no es falsificable).
- **Lectura:** abierta, por las vistas `public_*` (Supabase REST) — sin teléfonos
  ni contactos.

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

La migración `0014` también:
- **Crea el colaborador #1 = nosotros**: `Venezuela Ayuda` / `source =
  venezuela-ayuda.com`, y se le emite la **primera API key**. (Nuestros reportes
  orgánicos siguen entrando por los forms con `source` por default; la key nos
  hace colaborador de primera clase y habilita usar la API también.)
- **Backfill**: a todo reporte existente **sin** `source` (los orgánicos del
  sitio) le asigna `source = venezuela-ayuda.com`. Los reportes **scrapeados ya
  traen su `source` de origen → no se tocan.**
- **Default a futuro**: `source` por default = `venezuela-ayuda.com` en las 4
  tablas, así los reportes orgánicos nuevos se atribuyen solos sin cambiar los
  forms. `/api/ingest` setea el `source` del socio y sobrescribe el default.

Regla de atribución: **default = Venezuela Ayuda; excepción = plataforma externa
con origen conocido.**

> Todo lo anterior va en **una sola migración: `0014_api_partners.sql`**.

---

## 3. Endpoints

### 3.1 Escritura — `POST /api/ingest` (cerrado por API key)

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
      "category": "medical",              // medical|food|water|shelter|transportation|electricity|rescue
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
  "accepted": 4,
  "rejected": 1,
  "results": [
    { "external_id": "cruzroja:1023", "status": "upserted" },
    { "external_id": "cruzroja:req-77", "status": "upserted" },
    { "external_id": "cruzroja:b-9", "status": "upserted" },
    { "external_id": "cruzroja:o-3", "status": "upserted" },
    { "external_id": "cruzroja:x", "status": "rejected", "error": "type inválido" }
  ]
}
```

**Códigos de error**
| Código | Causa |
|---|---|
| 401 | falta `x-api-key` o es inválida/revocada |
| 403 | la key no tiene scope `write` |
| 400 | body inválido |
| 413 | lote excede el tope |
| 429 | rate limit (incluye `Retry-After`) |

### 3.2 Lectura — `GET /rest/v1/public_*` (ya existe, abierto)

Es el endpoint de Supabase REST que el sitio ya usa. Sin datos privados.

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
  Describe `POST /api/ingest` y referencia la lectura `public_*`.
- **Swagger / Scalar UI**: página `/docs` que renderiza el spec — para que un
  integrador lea el contrato y pruebe llamadas.

---

## 6. Fuera de alcance (para coordinar con el otro equipo)

- **Dedup fuzzy / cross-fuente** (mismo "Juan Pérez" desde dos socios) lo dueña
  **otro equipo**. Nosotros solo dejamos cada fila estampada con `source` y
  `dedup_key` (`fuzzyKey(name)`) — el insumo que ellos necesitan.
- ⚠️ **Handoff a coordinar:** hoy el único proceso de dedup corre pegado al
  workflow de pull (`.github/workflows/ingest.yml` → `ingest.mjs --dedup`). Cuando
  retiremos el pull, hay que confirmar que el equipo de dedup ya corre el suyo
  sobre la misma DB, o acordar fecha de corte, para no dejar ventana sin dedup.

---

## 7. Resumen de lo que se construye (de nuestro lado)

| # | Entregable | Tipo |
|---|---|---|
| 1 | Migración `0014` — `api_partners` + columnas en `help_offers` + índices únicos | DB |
| 2 | Auth por API key (hash + lookup) | backend |
| 3 | `POST /api/ingest` (cerrado por key, upsert idempotente, atribución `source`) | endpoint |
| 4 | OpenAPI + `/docs` (Swagger) | docs |
| 5 | Gestión de colaboradores + keys en el panel admin existente (`/admin/colaboradores`) | admin UI |
| 6 | Retirar el pull (`ingest.mjs` + workflow) | cleanup |

Lectura: **se reusa el endpoint existente** (`public_*` por Supabase REST), no se
construye uno nuevo.

Plan técnico completo: `docs/plans/2026-06-26-001-feat-data-exchange-api-plan.md`.
