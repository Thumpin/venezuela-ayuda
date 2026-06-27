create table if not exists hospitalized (
  id          uuid primary key default gen_random_uuid(),
  nombre      text,
  apellido    text,
  ci          text,
  edad        text,
  hospital    text,
  status      text,
  fuentes     text,
  notas       text,
  created_at  timestamptz not null default now()
);

-- Public view
create or replace view public_hospitalized as
  select id, nombre, apellido, ci, edad, hospital, status, fuentes, notas, created_at
  from hospitalized;

-- Grant permissions for Supabase roles
grant select on hospitalized to anon, authenticated;
grant select on public_hospitalized to anon, authenticated;
