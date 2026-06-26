-- 0016 · Audit log append-only + RPC atómicas (CREATE / UPDATE)
--
-- Capacidad core de trazabilidad del hub: TODA mutación por la API (POST
-- /api/v1/reports y PATCH /api/v1/reports/{id}) deja un registro inmutable de
-- QUIÉN (el partner de la key), QUÉ (action + tabla/id), y el snapshot COMPLETO
-- before/after. El hub es colaborativo: cualquier socio puede editar cualquier
-- reporte; la seguridad no la da prohibir la edición sino este log inmutable y
-- atribuible (habilita revertir acciones de un socio malicioso — la herramienta
-- de reversión es un PR aparte; acá solo dejamos el cimiento).
--
-- ── Mecanismo de atomicidad elegido: FUNCIONES plpgsql RPC ──────────────────
-- El INSERT al audit DEBE ir en la MISMA transacción que la mutación del
-- reporte. Se eligieron funciones RPC (no triggers + GUC) porque:
--   1. PostgREST envuelve cada llamada `svc.rpc(...)` en UNA transacción →
--      mutación + audit son atómicos por construcción (todo o nada).
--   2. El actor (partner_id, source, request_id, ip, user_agent) viaja como
--      PARÁMETROS EXPLÍCITOS de la función. Con triggers habría que pasarlo por
--      GUCs de sesión (`set local`), frágil sobre el pooling de conexiones de
--      PostgREST y fácil de olvidar en algún path. Parámetros = imposible de
--      omitir.
--   3. La forma de los datos ya la conoce el endpoint (buildRow/buildPatch en JS
--      validan y construyen el row/patch); la función solo persiste + audita.
-- Las funciones son genéricas (despachan por nombre de tabla con SQL dinámico +
-- jsonb_populate_record, que castea cada campo contra el tipo REAL de la columna
-- — enums, timestamptz, boolean — sin listas de columnas hardcodeadas). Los
-- nombres de columna se citan con quote_ident/%I → sin superficie de inyección.

-- ── Tabla append-only ───────────────────────────────────────────────────────
create table if not exists audit_log (
  seq           bigint generated always as identity primary key, -- orden total inmutable
  occurred_at   timestamptz not null default now(),
  partner_id    uuid references api_partners (id) on delete set null, -- QUIÉN (de la key); se preserva el log si el partner se borra
  source        text,                                            -- snapshot del source (por si el partner cambia el suyo)
  action        text not null,                                   -- CREATE | UPDATE | HIDE
  resource_table text not null,
  resource_id   uuid not null,
  external_id   text,
  before        jsonb,                                           -- null en CREATE
  after         jsonb,                                           -- snapshot COMPLETO (puede incluir PII → es INTERNO)
  request_id    text,
  ip            text,
  user_agent    text
);

create index if not exists audit_log_resource_idx on audit_log (resource_id, seq);
create index if not exists audit_log_partner_idx on audit_log (partner_id, seq);

-- ── Append-only forzado en la DB (regla innegociable #1) ────────────────────
-- Nadie reescribe la historia: RLS on, SIN policies (ni de update ni de delete),
-- y se revocan los privilegios de update/delete a los roles públicos. El
-- service_role inserta (bypassa RLS) pero tampoco tiene policy de update/delete.
alter table audit_log enable row level security;
revoke update, delete on audit_log from anon, authenticated;

-- ── RPC: ingest atómico por tabla (CREATE) ──────────────────────────────────
-- Recibe el lote YA VALIDADO (rows construidos por buildRow) de UNA sola tabla.
-- Upsert idempotente por (source, external_id) + audit CREATE de cada fila, todo
-- en una transacción. Se llama una vez por tabla (≤4) → preserva la semántica de
-- éxito-parcial-por-tabla del endpoint original. Devuelve el #filas escritas.
create or replace function ingest_reports(
  p_table       text,
  p_rows        jsonb,
  p_partner     uuid,
  p_source      text,
  p_request_id  text,
  p_ip          text,
  p_user_agent  text
) returns integer
language plpgsql
as $fn$
declare
  v_allowed constant text[] := array['checkins','help_requests','help_offers','damaged_reports'];
  v_row     jsonb;
  v_cols    text;
  v_vals    text;
  v_updates text;
  v_after   jsonb;
  v_count   integer := 0;
begin
  if not (p_table = any (v_allowed)) then
    raise exception 'tabla no permitida: %', p_table;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    -- columnas = llaves del row construido (nunca trae id ni location → generados).
    -- v_updates excluye las llaves de conflicto (source/external_id son inmutables).
    select string_agg(quote_ident(k.key), ', '),
           string_agg('r.' || quote_ident(k.key), ', '),
           string_agg(format('%I = excluded.%I', k.key, k.key), ', ')
             filter (where k.key not in ('source', 'external_id'))
      into v_cols, v_vals, v_updates
      from jsonb_object_keys(v_row) as k(key);

    execute format(
      'insert into %1$I as t (%2$s) '
      || 'select %3$s from jsonb_populate_record(null::%1$I, $1) as r '
      || 'on conflict (source, external_id) do update set %4$s '
      || 'returning to_jsonb(t)',
      p_table, v_cols, v_vals, v_updates
    ) into v_after using v_row;

    insert into audit_log (partner_id, source, action, resource_table, resource_id, external_id, before, after, request_id, ip, user_agent)
      values (p_partner, p_source, 'CREATE', p_table, (v_after->>'id')::uuid, v_after->>'external_id', null, v_after, p_request_id, p_ip, p_user_agent);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$fn$;

-- ── RPC: modificación parcial atómica (UPDATE) ───────────────────────────────
-- Lockea la fila (FOR UPDATE), aplica el patch YA VALIDADO (buildPatch en JS:
-- solo columnas mutables, enums/coords validados, contact→phone_private), y
-- audita UPDATE con before/after completos. Devuelve la fila resultante (jsonb)
-- o null si el id no existe (→ 404 en el endpoint). id/source/external_id NO se
-- tocan (no están en el patch) → el creador original se preserva.
create or replace function patch_report(
  p_table       text,
  p_id          uuid,
  p_patch       jsonb,
  p_partner     uuid,
  p_source      text,
  p_request_id  text,
  p_ip          text,
  p_user_agent  text
) returns jsonb
language plpgsql
as $fn$
declare
  v_allowed constant text[] := array['checkins','help_requests','help_offers','damaged_reports'];
  v_before  jsonb;
  v_after   jsonb;
  v_set     text;
begin
  if not (p_table = any (v_allowed)) then
    raise exception 'tabla no permitida: %', p_table;
  end if;

  execute format('select to_jsonb(t) from %I as t where t.id = $1 for update', p_table)
    into v_before using p_id;
  if v_before is null then
    return null; -- no existe → el endpoint responde 404
  end if;

  select string_agg(format('%I = r.%I', k.key, k.key), ', ')
    into v_set
    from jsonb_object_keys(p_patch) as k(key);
  if v_set is null then
    return v_before; -- patch vacío (el endpoint ya lo rechaza antes; defensa)
  end if;

  execute format(
    'update %1$I as t set %2$s from jsonb_populate_record(null::%1$I, $1) as r '
    || 'where t.id = $2 returning to_jsonb(t)',
    p_table, v_set
  ) into v_after using p_patch, p_id;

  insert into audit_log (partner_id, source, action, resource_table, resource_id, external_id, before, after, request_id, ip, user_agent)
    values (p_partner, p_source, 'UPDATE', p_table, p_id, v_after->>'external_id', v_before, v_after, p_request_id, p_ip, p_user_agent);

  return v_after;
end;
$fn$;

-- Las funciones se llaman SOLO server-side con el service key. CREATE FUNCTION
-- otorga EXECUTE a PUBLIC por default → se revoca para que anon/authenticated no
-- puedan invocarlas vía PostgREST y saltarse el auth/validación del endpoint.
revoke execute on function ingest_reports(text, jsonb, uuid, text, text, text, text) from public;
revoke execute on function patch_report(text, uuid, jsonb, uuid, text, text, text, text) from public;
grant execute on function ingest_reports(text, jsonb, uuid, text, text, text, text) to service_role;
grant execute on function patch_report(text, uuid, jsonb, uuid, text, text, text, text) to service_role;

insert into applied_migrations (version) values ('0016') on conflict do nothing;
