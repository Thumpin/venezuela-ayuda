-- 0025 · El alta de un niño (UI o API) siembra su cadena de custodia igual
--
-- submitFoundChild (UI) sembraba a mano el evento "Registro inicial" y estampaba
-- last_custody_at/manage_token. El alta por la API pública (POST /api/v1/reports,
-- type=unaccompanied_child) entra por la MISMA RPC auditada ingest_reports pero
-- sin ese post-proceso → niños sin cadena de custodia y con last_custody_at NULL
-- (se ven "perdidos del mapa" en el panel admin). Unificamos en la DB: un trigger
-- AFTER INSERT siembra el primer evento, y defaults llenan last_custody_at/
-- manage_token cuando el caller los omite. Ambos caminos quedan idénticos por
-- construcción (también cualquier importador futuro).
--
-- IDEMPOTENCIA: la API hace upsert por (source, external_id). En Postgres, las
-- filas que entran por ON CONFLICT DO UPDATE disparan triggers de UPDATE, no de
-- INSERT → re-postear el mismo external_id NO re-siembra el evento. El trigger es
-- AFTER INSERT, así que solo corre para niños genuinamente nuevos.

-- Defaults: el caller que omita estos campos (la API vía buildRow) obtiene el
-- mismo valor que el UI pone explícito (submitFoundChild).
alter table unaccompanied_children
  alter column manage_token    set default gen_random_uuid()::text,
  alter column last_custody_at set default now();

-- Trigger: siembra el evento "Registro inicial" derivando los campos del NEW,
-- exactamente como lo hacía submitFoundChild a mano. Corre dentro de la
-- transacción del RPC (rol service_role, que ya escribe child_custody_events
-- desde el UI) → sin problema de RLS.
create or replace function seed_child_custody() returns trigger
language plpgsql
as $fn$
begin
  insert into child_custody_events
    (child_id, event_date, facility_name, status, note, source, recorded_by)
  values
    (new.id,
     new.last_seen_at,
     coalesce(new.hospital, new.last_seen_place),
     new.status,
     'Registro inicial',
     new.source,
     new.reporter_name);
  return null; -- AFTER trigger: el valor de retorno se ignora
end;
$fn$;

drop trigger if exists seed_child_custody_trg on unaccompanied_children;
create trigger seed_child_custody_trg
  after insert on unaccompanied_children
  for each row execute function seed_child_custody();

insert into applied_migrations (version) values ('0025') on conflict do nothing;
