-- 0026 · Hospital supply status hub schema (issue #76)
--
-- Introduces three new tables that form the foundation of the hospital supply
-- status domain. This domain is intentionally separate from patient intake
-- (checkins / hospitalized_patients) — it tracks RESOURCE state per hospital,
-- not individual person records.
--
-- Security model:
--   - All writes are service-role only (RLS enabled, no public insert/update)
--   - Public views strip internal notes, private contact data, and any row
--     that is either unverified or expired
--   - `notes_internal` on hospital_supply_status is NEVER projected publicly
--
-- Ordering: this migration must run before 0027 (hospital_pocs), which adds
-- the poc_id FK onto hospital_supply_status.

-- ── hospitals ─────────────────────────────────────────────────────────────────
-- First-class entity. A hospital can have supply status across multiple
-- categories. Coordinates are optional (geocoded later via admin tooling).

create table if not exists hospitals (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  state        text,                          -- Venezuelan state / departamento
  city         text,
  address      text,
  latitude     double precision,
  longitude    double precision,
  location     geography(Point, 4326) generated always as (
                 case
                   when latitude is not null and longitude is not null
                   then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
                   else null
                 end
               ) stored,
  type         text check (type in ('public', 'private', 'clinic', 'military')),
  verified     boolean not null default false,
  hidden       boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists hospitals_city_idx on hospitals (city);
alter table hospitals enable row level security;
revoke insert, update, delete on hospitals from anon, authenticated;

-- ── hospital_supply_status ────────────────────────────────────────────────────
-- One row per (hospital, category) — the "current state" of a resource type.
-- Updated in place as new confirmed reports arrive; full history lives in
-- audit_log. `notes_internal` holds reviewer/POC context never shown publicly.

create table if not exists hospital_supply_status (
  id               uuid primary key default gen_random_uuid(),
  hospital_id      uuid not null references hospitals (id) on delete cascade,
  category         text not null
                     check (category in ('SUPPLIES', 'BEDS', 'STAFF', 'EQUIPMENT')),
  overall_status   text not null default 'unknown'
                     check (overall_status in ('green', 'yellow', 'red', 'unknown')),
  source           text,            -- originating partner / source identifier
  source_record_id text,            -- idempotency key from the source
  confidence_level text not null default 'PENDING_REVIEW'
                     check (confidence_level in ('CONFIRMED', 'PENDING_REVIEW', 'EXTRACTED')),
  notes_internal   text,            -- PRIVATE: reviewer context, never public
  updated_at       timestamptz not null default now(),
  verified_at      timestamptz,     -- set when a POC or admin confirms the status
  expires_at       timestamptz,     -- unconfirmed signals expire; CONFIRMED rows may not
  created_at       timestamptz not null default now(),
  unique (hospital_id, category)    -- one canonical row per resource type per hospital
);

create index if not exists hss_hospital_idx on hospital_supply_status (hospital_id);
alter table hospital_supply_status enable row level security;
revoke insert, update, delete on hospital_supply_status from anon, authenticated;

-- ── supply_items ──────────────────────────────────────────────────────────────
-- Granular itemised needs within a supply status record (e.g. "50 units of
-- insulin, priority: critical"). Linked to a supply_status row, deleted on
-- cascade so stale items don't outlive their parent status.

create table if not exists supply_items (
  id                uuid primary key default gen_random_uuid(),
  supply_status_id  uuid not null references hospital_supply_status (id) on delete cascade,
  name              text not null,
  item_type         text,
  quantity_required integer check (quantity_required > 0),
  unit              text,           -- 'units' | 'boxes' | 'liters' | 'doses' etc.
  priority          text check (priority in ('critical', 'high', 'medium', 'low')),
  operational_notes text,
  state             text check (state in ('needed', 'sufficient', 'unavailable')),
  created_at        timestamptz not null default now()
);

create index if not exists supply_items_status_idx on supply_items (supply_status_id);
alter table supply_items enable row level security;
revoke insert, update, delete on supply_items from anon, authenticated;

-- ── Public views ──────────────────────────────────────────────────────────────
-- Consumers (map, adapters, public API) read these views only.
-- They exclude: notes_internal, hidden/unverified hospitals, expired statuses.

create or replace view public_hospitals as
  select id, name, state, city, address, latitude, longitude, type, created_at
  from hospitals
  where verified = true and hidden = false;

create or replace view public_hospital_supply_status as
  select
    hss.id,
    hss.hospital_id,
    hss.category,
    hss.overall_status,
    hss.source,
    hss.confidence_level,
    hss.updated_at,
    hss.verified_at,
    hss.expires_at,
    h.name      as hospital_name,
    h.state     as hospital_state,
    h.city      as hospital_city,
    h.latitude  as hospital_lat,
    h.longitude as hospital_lng
  from hospital_supply_status hss
  join hospitals h on h.id = hss.hospital_id
  where h.verified = true
    and h.hidden   = false
    and (hss.expires_at is null or hss.expires_at > now());

create or replace view public_supply_items as
  select si.id, si.supply_status_id, si.name, si.item_type,
         si.quantity_required, si.unit, si.priority, si.state
  from supply_items si
  join hospital_supply_status hss on hss.id = si.supply_status_id
  join hospitals               h   on h.id  = hss.hospital_id
  where h.verified = true and h.hidden = false;

grant select on public_hospitals             to anon, authenticated;
grant select on public_hospital_supply_status to anon, authenticated;
grant select on public_supply_items          to anon, authenticated;

insert into applied_migrations (version) values ('0026') on conflict do nothing;
