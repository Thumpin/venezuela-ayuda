-- 0014 · Collection centers ("centros de acopio") — unified table
--
-- Replaces the two hardcoded sources (RELIEF_CENTERS in lib/data.ts and
-- HELP_ABROAD_CITIES in lib/helpAbroad.ts). Discriminated by `country`:
--   country = 'Venezuela'  → shown on the map
--   other countries        → shown in the /ayudar-fuera list
--
-- A center's contact info IS public (it's an organization, not an individual) —
-- the public view exposes contact/website but never the manage_token. Public
-- submissions arrive with verified = false (hidden until an admin approves).

create table if not exists collection_centers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  country       text not null,
  state         text,                       -- VE state (optional)
  city          text,
  address       text,
  latitude      double precision,
  longitude     double precision,
  location      geography(Point, 4326) generated always as (
                  case
                    when latitude is not null and longitude is not null
                    then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
                    else null
                  end
                ) stored,
  description   text,                        -- optional "cómo ayudar" note
  resources     text,                        -- what they receive (free text)
  organizers    text,                        -- name(s) of the organizers
  contact       text,                        -- phone/email (PUBLIC for centers)
  website       text,
  can_ship_to_venezuela boolean,             -- logistics to send donations to VE
  volunteers_count      integer,             -- how many volunteers they have
  needs_volunteers      boolean,             -- whether they need more
  needs         text[] not null default '{}', -- 'centro-de-acopio' | 'voluntarios'
  verified      boolean not null default false,
  hidden        boolean not null default false,
  manage_token  text,                        -- private; lets the submitter manage it
  source        text,                        -- 'seed' | 'user'
  created_at    timestamptz not null default now()
);
create index if not exists collection_centers_country_idx on collection_centers (country);

alter table collection_centers enable row level security; -- writes via service key only

-- Public view: only verified + visible; excludes the private manage_token.
create or replace view public_collection_centers as
  select id, name, country, state, city, address, latitude, longitude,
         description, resources, organizers, contact, website,
         can_ship_to_venezuela, volunteers_count, needs_volunteers, needs, created_at
  from collection_centers
  where verified = true and hidden = false;

grant select on public_collection_centers to anon, authenticated;
revoke insert, update, delete on collection_centers from anon, authenticated;

insert into applied_migrations (version) values ('0014') on conflict do nothing;
