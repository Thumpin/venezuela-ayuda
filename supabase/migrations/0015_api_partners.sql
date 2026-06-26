-- 0015 · API partners (colaboradores) + atribución de origen + idempotencia
--
-- El hub central recibe reportes de múltiples sitios por `POST /api/v1/ingest`,
-- cerrado por API key. Cada socio (colaborador) vive en `api_partners`; su key
-- se guarda solo como hash. El `source` de cada reporte se estampa server-side
-- desde la key (no spoofeable).
--
-- Además: atribuye TODO reporte. Default = nuestra propia plataforma
-- (venezuela-ayuda.com); excepción = reportes con `source` de origen ya conocido
-- (los scrapeados históricos), que NO se tocan.

-- Colaboradores (sitios socios) -------------------------------------------
-- key_hash/key_prefix son nullable: una fila puede registrarse antes de que se
-- le emita su key (caso del seed de nuestra propia plataforma, abajo).
create table if not exists api_partners (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  source     text not null unique,          -- se estampa en cada fila ingestada
  key_hash   text unique,                   -- sha256 hex de la API key (nunca la key en claro)
  key_prefix text,                           -- primeros chars, para identificar sin revelar
  scopes     text[] not null default '{write}',
  contact    text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table api_partners enable row level security; -- sin policies → solo service role

-- Colaborador #1 = nuestra propia plataforma. Es el `source` por defecto de los
-- reportes propios y el colaborador que recibe la primera API key (la key se
-- emite por el flujo de minteo, fuera del SQL).
--
-- El id es FIJO y conocido (no gen_random_uuid): la escritura interna del sitio
-- (server actions) pasa por las mismas RPC del API y necesita este partner_id sin
-- leer la DB. El MISMO uuid vive en src/lib/canonical.mjs (VA_PARTNER_ID) — única
-- fuente de verdad compartida entre el seed y el código.
insert into api_partners (id, name, source)
  values ('11111111-1111-4111-8111-111111111111', 'Venezuela Ayuda', 'venezuela-ayuda.com')
  on conflict (source) do nothing;

-- Completar columnas multi-fuente en help_offers ---------------------------
-- 0007 las agregó a checkins, damaged_reports y help_requests, pero NO a
-- help_offers. Se completan acá para poder ingestar ofertas con atribución +
-- idempotencia. (No se agrega dedup_key: el dedup fuzzy cross-fuente es de otro
-- equipo y hoy no cubre ofertas — la ingesta tampoco lo estampa para offers.)
alter table help_offers add column if not exists source text;
alter table help_offers add column if not exists source_url text;
alter table help_offers add column if not exists external_id text;

-- Recrear la vista pública de ofertas para exponer source + source_url, igual
-- que ya hacen public_checkins / public_help_requests / public_damaged_reports
-- (0007/0012). Sin esto, la lectura de ofertas no traería atribución y la
-- columna source quedaría inservible para el consumidor. Mantiene el filtro de
-- moderación (hidden = false) y NO expone contact (privado).
create or replace view public_help_offers as
  select id, category, description, city, latitude, longitude, availability,
         available, created_at, source, source_url
  from help_offers where hidden = false;

grant select on public_help_offers to anon, authenticated;

-- Atribución de reportes existentes ----------------------------------------
-- Los orgánicos (forms del sitio) no tienen source → se asignan a nosotros.
-- Los scrapeados ya traen su source de origen → el WHERE los respeta.
update checkins        set source = 'venezuela-ayuda.com', source_url = 'https://venezuela-ayuda.com' where source is null;
update help_requests   set source = 'venezuela-ayuda.com', source_url = 'https://venezuela-ayuda.com' where source is null;
update help_offers     set source = 'venezuela-ayuda.com', source_url = 'https://venezuela-ayuda.com' where source is null;
update damaged_reports set source = 'venezuela-ayuda.com', source_url = 'https://venezuela-ayuda.com' where source is null;

-- Atribución de reportes futuros (sin tocar los forms / server actions) -----
-- Un submit orgánico nuevo se atribuye solo por el default; `/api/ingest` setea
-- el source del socio explícitamente y sobrescribe este default.
alter table checkins        alter column source set default 'venezuela-ayuda.com';
alter table help_requests   alter column source set default 'venezuela-ayuda.com';
alter table help_offers     alter column source set default 'venezuela-ayuda.com';
alter table damaged_reports alter column source set default 'venezuela-ayuda.com';

-- Idempotencia: upsert por (source, external_id) ---------------------------
-- Un re-push del mismo socio con el mismo external_id actualiza su fila en vez
-- de duplicar.
--
-- Índice NO parcial a propósito: PostgREST manda `on_conflict=source,external_id`
-- sin predicado, y Postgres no puede inferir un índice PARCIAL como target de
-- ON CONFLICT (error 42P10). Un índice único normal ya trata los NULL como
-- distintos (NULLS DISTINCT, default), así que los reportes orgánicos sin
-- external_id no colisionan entre sí.
--
-- PRERREQUISITO: la data no debe tener pares (source, external_id) duplicados, o
-- el CREATE UNIQUE INDEX abortará. El dedup de duplicados exactos lo maneja un
-- proceso aparte (no esta migración) y debe correr antes si hubiera duplicados.
create unique index if not exists checkins_source_extid_uidx        on checkins (source, external_id);
create unique index if not exists help_requests_source_extid_uidx   on help_requests (source, external_id);
create unique index if not exists help_offers_source_extid_uidx     on help_offers (source, external_id);
create unique index if not exists damaged_source_extid_uidx         on damaged_reports (source, external_id);

-- Nota: el lookup de auth por `key_hash` usa el índice de la constraint UNIQUE
-- de la columna (no hace falta un índice extra).

insert into applied_migrations (version) values ('0015') on conflict do nothing;
