# 🛡️ Guía Técnica y Plan de Arquitectura: Venezuela Ayuda

> **Última actualización:** 2026-06-27 — Rama `feat/originalcat-api-local-tests`

Este documento detalla el esquema del sistema, el motor de deduplicación (`originalcat`), la unificación de APIs, los sistemas de seguridad, la lógica de cruce desaparecidos/hospitalizados y la hoja de ruta de integraciones futuras.

---

## 1. Esquemas de Datos del Sistema de Salud

### 🏥 Hospitales (`collection_centers` con `source = "hospital-cross-reference"`)
- **`name`**: Nombre oficial del centro.
- **`verified`**: Verificado por administración.
- Pueden solicitar insumos a centros de acopio (funcionalidad propuesta).

### 👥 Hospitalizados (`hospitalized`)
- Registro consolidado de pacientes ingresados.
- **`status`** clínico: `Estable`, `Crítico`, `Fallecido`, `Alta` — mapeado a estados de app.

### 🔎 Desaparecidos (`checkins` con `status = "LOOKING_FOR_SOMEONE"`)
- Reportes de búsqueda cargados por familiares.
- Incluyen foto (`photo_url`) visible en tarjetas del panel admin y búsqueda pública.

---

## 2. Enums de Estado (`checkin_status`)

Migración `0022_add_status_values.sql` agregó `DIFUNTO` y `HOSPITALIZADO` al enum de PostgreSQL:

| Valor                | Label UI          | Uso                                              |
|----------------------|-------------------|--------------------------------------------------|
| `SAFE`               | A Salvo ✅        | Persona confirmada como a salvo                  |
| `NEEDS_HELP`         | Necesita ayuda 🆘 | Persona que requiere asistencia                  |
| `LOOKING_FOR_SOMEONE`| En búsqueda 🔎    | Familiar reportando a un desaparecido            |
| `DIFUNTO`            | Fallecido/a 🕊️   | Persona confirmada fallecida                     |
| `HOSPITALIZADO`      | Hospitalizado/a 🏥| Persona identificada en un hospital              |

### Prioridad de estado (`STATUS_RANK`) en fusión multi-fuente:

```
NEEDS_HELP (4) > LOOKING_FOR_SOMEONE (3) > HOSPITALIZADO (2) > SAFE (1) > DIFUNTO (0)
```

---

## 3. Motor de Deduplicación (`originalcat`)

El motor unifica registros de fuentes externas con reportes de la app usando `fuzzyKey`.

### Funcionamiento de `fuzzyKey` (`src/lib/dedup.ts`)

1. Normaliza: minúsculas, sin acentos, sin caracteres especiales.
2. Filtra stopwords: `de, del, la, y, un, ...`
3. Filtra tokens cortos: solo tokens de 3+ caracteres.
4. Ordena tokens alfabéticamente (orden-independiente).
5. Deduplica tokens.

**Ejemplos:**
- `"Carlos Eduardo Mendoza"` → `mp:carlos eduardo mendoza`
- `"Mendoza, Carlos E."` → `mp:carlos eduardo mendoza` ✅

### Rutas del panel de deduplicación

| Ruta                              | Descripción                              |
|-----------------------------------|------------------------------------------|
| `/admin/duplicados`               | Candidatos HARD / STRONG / REVIEW        |
| `/admin/duplicados/revisados`     | Historial de decisiones tomadas          |

### API Dataset (`originalcat`) bajo `/:dataset_slug/api/`

| Ruta                    | Descripción                            |
|-------------------------|----------------------------------------|
| `GET /api/records`      | Listar registros del dataset           |
| `POST /api/uploads`     | Subir CSV/SQL para deduplicar          |
| `GET /api/duplicates`   | Consultar candidatos de merge          |
| `POST /api/groups`      | Agrupar registros por fuzzyKey         |
| `GET /api/relationships`| Ver relaciones entre registros         |
| `GET /api/exports`      | Exportar registros procesados          |

---

## 4. Lógica de Cruce: Desaparecidos ↔ Hospitalizados

### Flujo en panel admin (`AdminTabs.tsx`)

```
listModerationItems()     → checkins LOOKING_FOR_SOMEONE (con photo_url)
listHospitalizedAdmin()   → hasta 2000 registros hospitalized

Por cada desaparecido:
  toTokens(name) → tokens ≥3 chars, sin acentos, sin puntuación
  ¿Todos los tokens ∈ hTokens del hospitalizado?
    Sí → mostrar badge ✚ NombreHospital en la tarjeta
    No → tarjeta normal
```

### Algoritmo token-based (consistente con `fuzzyKey`)

```typescript
const toTokens = (n: string) =>
  n.toLowerCase().normalize("NFD")
   .replace(/[\u0300-\u036f]/g, "")
   .replace(/[^a-z0-9 ]/g, " ")
   .replace(/\s+/g, " ").trim()
   .split(" ").filter((t) => t.length >= 3);

// Todos los tokens del desaparecido deben existir en el registro hospitalario
const match = hospitalized.find((h) => {
  const hTokens = new Set(toTokens(`${h.nombre} ${h.apellido}`));
  return searchTokens.every((t) => hTokens.has(t));
});
```

### Mapeo de estado clínico → estado app

| Status en `hospitalized`    | Status en app  |
|-----------------------------|----------------|
| `FALLECIDO` / `DIFUNTO`     | `DIFUNTO`      |
| `ALTA` / `ENCONTRADO`       | `SAFE`         |
| Cualquier otro              | `HOSPITALIZADO`|

### Fusión multi-fuente en búsqueda pública (`/buscar`)

```
searchCheckins() + searchHospitalRegistry() + searchMissingPersonsApi()
         ↓
    mergePeople()  — agrupa por fuzzyKey cross-source
         ↓
    PersonResultCard — foto, hospital, estado unificado, modal
```

---

## 5. Unificación de APIs (`/api/v1/reports`)

### Rutas implementadas

| Método  | Ruta                          | Descripción                          |
|---------|-------------------------------|--------------------------------------|
| `POST`  | `/api/v1/reports`             | Crear reporte autenticado            |
| `GET`   | `/api/v1/reports/:id`         | Obtener reporte por ID               |
| `PATCH` | `/api/v1/reports/:id`         | Actualizar campos del reporte        |
| `GET`   | `/api/v1/reports/:id/history` | Historial de cambios de estado       |

### Autenticación por API Key

```
Authorization: Bearer va_live_<hash>
     ↓
parsePrefix(key) → primeros 12 chars como índice de lookup
     ↓
fetchByHash(key) → verifica en tabla api_partners (TTL cache en memoria)
     ↓
Si revocada o inexistente → 401 Unauthorized
```

### Tipos de reporte aceptados

| `type`              | Tabla destino      | Filtro status             |
|---------------------|--------------------|---------------------------|
| `missing_person`    | `checkins`         | `LOOKING_FOR_SOMEONE`     |
| `checkin`           | `checkins`         | `SAFE` / `NEEDS_HELP`     |
| `help_request`      | `help_requests`    | —                         |
| `help_offer`        | `help_offers`      | —                         |
| `damaged_building`  | `damaged_reports`  | —                         |

---

## 6. Interfaz de Administración

### Tarjeta de desaparecido (`ModerationRow`)

- **Foto miniatura** (56×56px): `object-cover`, `rounded-xl`.
- **Zoom al hover**: `scale-110` suave vía `group-hover` (overflow-hidden para contener).
- **Modal al clic**: 60vw × 60vh, fondo oscuro + `backdrop-blur`, botón ✕, clic fuera cierra.
- **Badge de hospital**: `✚ NombreHospital` en rojo cuando hay match token-based.
- **Edición inline**: "Completar Detalles" abre form con `nombre`, `status`, `ciudad`, `mensaje`, `teléfono`.

### Panel `/admin` — Pestañas

| Tab           | Contenido                                             |
|---------------|-------------------------------------------------------|
| 🏥 Hospitales | Centros con `source = "hospital-cross-reference"`     |
| 👥 Hospitalizados | Pacientes en `hospitalized` (edición inline)      |
| 👤 Personas   | Reportes `LOOKING_FOR_SOMEONE` con cruce hospitalario |
| 📦 Solicitudes| `help_requests` activas                               |
| 🤝 Ofrecimientos | `help_offers` disponibles                          |
| 🏢 Edificios  | `damaged_reports`                                     |
| 🏠 Acopio     | `collection_centers` verificados                      |

---

## 7. Sistemas de Seguridad

### 🚦 Rate Limit (propuesto)
- **Lecturas API**: 60 req/min. **Escrituras**: 15 req/min.
- Respuesta: `HTTP 429` con cabecera `Retry-After`.

### 🖼️ Límite de Subida de Imágenes
- Máx. 10 subidas/hora por IP durante emergencias.
- Contador temporal con expiración 1h → `403 Forbidden` si supera umbral.

### 🪪 Registro con Identificación (KYC — propuesto)
- Cédula de Identidad (V/E) obligatoria para colaboradores.
- Validación por OTP vía SMS o API del CNE/SAIME.

### 🔒 Cabeceras de Seguridad implementadas
- `SECURITY_HEADERS`: páginas públicas (CSP, X-Frame-Options, etc.)
- `API_SECURITY_HEADERS`: lockdown total para endpoints de API
- `API_CORS_HEADERS`: `Allow-Origin: *` solo en lecturas

---

## 8. Funcionalidades Propuestas

### 📦 Solicitud de Insumos (Hospitales → Centros de Acopio)

```sql
create table hospital_supply_requests (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid references collection_centers(id) on delete cascade,
  items       jsonb not null,   -- [{ "item": "Gasas", "qty": 100 }, ...]
  urgency     urgency_level not null default 'MEDIUM',
  status      request_status not null default 'OPEN',
  created_at  timestamptz not null default now()
);
```

### 💬 Notificaciones WhatsApp

```
[Cambio de estado en admin]
        ↓
[Supabase Database Trigger / Edge Function]
        ↓
[Meta WhatsApp Cloud API / Twilio]
        ↓
[Mensaje al familiar suscrito en phone_private]
```

**Ejemplo de mensaje:**
> *"Hola, el estado de Carlos Eduardo Mendoza cambió a: 🏥 Hospitalizado en Hospital José María Vargas. Ver detalles: venezuela-ayuda.com/persona/..."*

---

## 9. Bugs Corregidos (sesión 2026-06-27)

| # | Problema | Archivo | Fix |
|---|----------|---------|-----|
| 1 | Matching frágil: `"ana".includes(...)` → falsos positivos | `AdminTabs.tsx` | Token matching por conjunto (todos los tokens deben estar presentes) |
| 2 | `HOSPITALIZADO` rank igual a `SAFE` → status incorrecto | `people.ts` | Rank: HOSPITALIZADO(2) > SAFE(1) |
| 3 | `hospitalHit()` ignoraba status clínico real | `people.ts` | Mapeo explícito FALLECIDO→DIFUNTO, ALTA→SAFE |
| 4 | Límite de 150 hospitalizados → punto ciego en cruce | `admin.ts` | Límite subido a 2000 |
| 5 | Foto no visible en tarjetas admin de desaparecidos | `admin.ts` + `ModerationRow.tsx` | `photo_url` en `ModerationItem`, thumbnail + modal |
| 6 | Modal de foto sin zoom hover | `ModerationRow.tsx` | `group-hover:scale-110` + modal 60vw/60vh |
| 7 | JSX fragment con `;` fuera del `return()` | `ModerationRow.tsx` | Corregido cierre `</>` dentro de `return()` |

---

## 10. Estructura de Archivos Clave

```
src/
├── app/
│   ├── admin/
│   │   ├── page.tsx                     # Carga datos panel admin en paralelo
│   │   ├── actions.ts                   # Server actions: hide, delete, update, getReportDetails
│   │   ├── duplicados/page.tsx          # Candidatos de merge (deduplicación)
│   │   └── duplicados/revisados/        # Historial de decisiones
│   ├── api/
│   │   ├── v1/reports/                  # API pública autenticada (originalcat + bitupx)
│   │   ├── duplicates/                  # API originalcat: duplicados
│   │   ├── groups/                      # API originalcat: agrupaciones
│   │   ├── records/                     # API originalcat: registros
│   │   ├── uploads/                     # API originalcat: subida de datasets
│   │   ├── exports/                     # API originalcat: exportaciones
│   │   ├── relationships/               # API originalcat: relaciones
│   │   └── [dataset_slug]/api/          # Namespace por dataset
│   └── buscar/page.tsx                  # Búsqueda pública multi-fuente con fusión
├── components/
│   ├── PersonResultCard.tsx             # Tarjeta pública: foto, modal, estado unificado
│   └── admin/
│       ├── AdminTabs.tsx                # Panel admin con cruce desaparecidos/hospitalizados
│       ├── ModerationRow.tsx            # Tarjeta admin: foto+zoom+modal+edición inline
│       ├── MergeCandidateRow.tsx        # Candidato de merge
│       └── MergeTabs.tsx               # Tabs del panel de duplicados
└── lib/
    ├── admin.ts                         # Tipos y queries (ModerationItem con photo_url, límite 2000)
    ├── canonical.mjs                    # Fuente de verdad de enums
    ├── constants.ts                     # Labels, colores, metadatos de status
    ├── data.ts                          # searchCheckins, searchHospitalRegistry, mergePeople
    ├── dedup.ts                         # fuzzyKey — identidad cross-source
    ├── people.ts                        # mergePeople, STATUS_RANK corregido, hospitalHit
    └── validation.ts                    # Validación de enums y tipos

supabase/migrations/
    ├── 0020_hospitalized.sql            # Tabla hospitalized + vista public_hospitalized
    ├── 0021_merge_candidates.sql        # Tabla merge_candidates
    └── 0022_add_status_values.sql       # Enum DIFUNTO + HOSPITALIZADO

scripts/
    ├── canonical.test.mjs               # 108 tests — 100% pass
    ├── cross-reference-missing.mjs      # Cruce manual desaparecidos vs hospitalizados
    └── seed-hospitalized.mjs            # Seed de datos para dev
```
