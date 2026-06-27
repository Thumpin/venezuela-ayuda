-- 0021 · Registro de niños no acompañados encontrados + cadena de custodia
--
-- Registro de salvaguarda para niños/niñas encontrados solos tras la emergencia
-- (issue #47). La idea NO es un buscador público de menores sino un registro con
-- SEGUIMIENTO DE CUSTODIA: saber, por cada niño, dónde está y con quién, y poder
-- rastrear cómo evoluciona en el tiempo.
--
-- PRIVACIDAD (protección infantil — regla innegociable): la superficie pública
-- expone ÚNICAMENTE el nombre/apodo (para que un familiar reconozca que el niño
-- está en el registro). Todo lo demás — ubicación, foto, custodio, descripción,
-- contacto de quien reporta — vive solo en la tabla privada y NUNCA sale por la
-- vista pública ni por la API abierta.
--
-- Campos tomados 1:1 del formulario actual "Infancia Protegida Vzla — Registro".

-- Enums (opciones literales del formulario) ---------------------------------
do $$ begin
  create type child_gender as enum ('BOY', 'GIRL', 'UNSPECIFIED');
exception when duplicate_object then null; end $$;

-- Situación actual del niño (6 opciones del form).
do $$ begin
  create type child_status as enum (
    'ALONE_NO_FAMILY',           -- Sólo sin familiares ni adultos de referencia cerca
    'ACCOMPANIED_SEEKING_FAMILY',-- Acompañado pero buscando a su familia
    'IN_SHELTER',                -- En refugio
    'IN_HOSPITAL',               -- En hospital o centro de salud
    'REUNITED',                  -- Reunificado con su familia
    'WITH_NON_FAMILY'            -- Acompañado por alguien que no es familia ni conocido
  );
exception when duplicate_object then null; end $$;

-- De dónde proviene la información cuando NO hubo contacto directo (5 opciones).
do $$ begin
  create type child_info_source as enum (
    'SOCIAL_MEDIA',   -- Redes sociales (publicación, grupo, historia)
    'FRIEND_FAMILY',  -- Un amigo, familiar o conocido
    'INSTITUTION',    -- Una institución (hospital, refugio, organización)
    'EXISTING_LIST',  -- Una lista o registro existente
    'OTHER'           -- Otra fuente
  );
exception when duplicate_object then null; end $$;

-- Tabla privada -------------------------------------------------------------
-- Una columna por campo del formulario. `name` es el ÚNICO campo público.
create table if not exists unaccompanied_children (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,        -- Nombre o apodo del niño/niña (PÚBLICO)
  reporter_name      text,                 -- Nombre completo de quien completa el form (privado)
  age                text,                 -- Edad aproximada (texto: años/meses/desconocida)
  gender             child_gender,         -- Género
  description        text,                 -- Descripción física
  found_place        text,                 -- Lugar donde fue encontrado (texto libre)
  found_at           date,                 -- Fecha donde fue encontrado
  last_seen_at       date,                 -- ¿Cuándo fue la última vez que lo vio?
  hospital           text,                 -- Hospital o centro de salud donde fue atendido
  last_seen_place    text,                 -- Último lugar donde lo vio
  status             child_status not null default 'ALONE_NO_FAMILY', -- Situación actual
  direct_contact     boolean,              -- ¿Tuvo contacto directo? (false = de otra fuente)
  info_source        child_info_source,    -- Si es de otra fuente, ¿de dónde proviene?
  info_source_detail text,                 -- Especifica la fuente
  notes              text,                 -- Notas adicionales
  photo_url          text,                 -- Foto (privada — protección infantil)
  -- Sistema -----------------------------------------------------------------
  is_minor           boolean not null default true, -- derivado de age (siempre menor por contexto)
  latitude           double precision,     -- opcional: geolocalización del lugar encontrado
  longitude          double precision,
  location           geography(Point, 4326) generated always as (
                       case
                         when latitude is not null and longitude is not null
                         then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
                         else null
                       end
                     ) stored,
  manage_token       text,                 -- privado; quien reportó actualiza la custodia
  source             text,                 -- atribución de fuente (igual que el resto)
  source_url         text,
  external_id        text,                 -- id de la fuente, para re-imports idempotentes
  dedup_key          text,                 -- nombre normalizado para dedup cross-fuente
  hidden             boolean not null default false, -- moderación
  verified           boolean not null default false,
  last_custody_at    timestamptz,          -- última actualización de paradero ("no se pierde del mapa")
  created_at         timestamptz not null default now()
);

create index if not exists children_location_idx on unaccompanied_children using gist (location);
create index if not exists children_created_idx   on unaccompanied_children (created_at desc);
create index if not exists children_dedup_idx     on unaccompanied_children (dedup_key) where dedup_key is not null;
create index if not exists children_extid_idx     on unaccompanied_children (external_id) where external_id is not null;
create unique index if not exists children_source_extid_uidx on unaccompanied_children (source, external_id);
-- Para detectar niños sin actualización reciente de custodia (los que "se pierden del mapa").
create index if not exists children_stale_idx on unaccompanied_children (last_custody_at);

-- Vista pública: SOLO el nombre (+ id opaco y created_at para paginación). ----
create or replace view public_unaccompanied_children as
  select id, name, created_at
  from unaccompanied_children
  where hidden = false;

-- Cadena de custodia: eventos append-only de paradero/custodia por niño. ------
-- Responde "¿dónde está y con quién?" en el tiempo. Sin vista pública: solo el
-- server (service key) lee/escribe; quien reportó la ve vía su manage link.
create table if not exists child_custody_events (
  seq           bigint generated always as identity primary key, -- orden total inmutable
  child_id      uuid not null references unaccompanied_children (id) on delete cascade,
  occurred_at   timestamptz not null default now(),
  event_date    date,            -- fecha del evento de custodia (si se conoce)
  placement     text,            -- hospital / refugio / familia temporal / autoridad
  facility_name text,            -- dónde (instalación)
  custodian     text,            -- con quién
  status        child_status,    -- situación en ese momento
  note          text,
  source        text,
  recorded_by   text,            -- quién registró el evento (ONG/hospital/autoridad)
  created_at    timestamptz not null default now()
);

create index if not exists child_custody_events_child_idx on child_custody_events (child_id, seq);

-- RLS / grants --------------------------------------------------------------
-- Escrituras solo por service key. Lectura pública únicamente vía la vista
-- solo-nombre. La tabla de custodia es append-only (sin update/delete).
alter table unaccompanied_children enable row level security;
alter table child_custody_events  enable row level security;

revoke insert, update, delete on unaccompanied_children from anon, authenticated;
revoke insert, update, delete on child_custody_events  from anon, authenticated;

-- Defensa en profundidad: RLS sin policy de SELECT ya devuelve 0 filas, pero
-- revocamos SELECT explícitamente para que un futuro grant/policy accidental no
-- abra la tabla base con PII de menores. El acceso público pasa SOLO por la vista.
revoke select on unaccompanied_children from anon, authenticated;
revoke select on child_custody_events  from anon, authenticated;

grant select on public_unaccompanied_children to anon, authenticated;

insert into applied_migrations (version) values ('0021') on conflict do nothing;
