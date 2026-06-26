-- 0018 · Escritura interna auditada: collection_centers en las RPC + DELETE
--
-- Cierra el último mundo de escritura desacoplado. Hasta acá, el API externo
-- escribía vía RPC atómicas (0016/0017) → auditado y atribuido; PERO la escritura
-- INTERNA del sitio (server actions) escribía DIRECTO a las tablas → SIN audit_log.
-- A partir de 0018, los server actions pasan por las MISMAS RPC, atribuidos a
-- nuestro propio socio (venezuela-ayuda.com, id fijo del seed 0015). Para que eso
-- cubra TODO el CRUD interno faltan dos cosas en la capa SQL:
--
--   1. collection_centers en ingest_reports/patch_report. La tabla NO tiene
--      external_id ni el conflict target (source, external_id) de las 4 tablas de
--      reporte → su insert es SIMPLE por id (cada postulación es una fila nueva),
--      no el upsert idempotente. El update por id ya es genérico en patch_report.
--   2. La operación DELETE (el admin borra de verdad reportes y centros). Hoy no
--      existe RPC de borrado → se agrega delete_report, que captura el snapshot
--      `before`, borra, y audita action=DELETE (after=null) en una transacción.
--
-- Se mantienen las garantías de 0016: audit append-only, atomicidad (mutación +
-- audit en la misma función/transacción), SQL dinámico con quote_ident/%I, y
-- EXECUTE revocado a público + solo service_role. `audit_log.action` no tiene
-- CHECK (es text) → DELETE entra sin tocar constraints.

-- ── ingest_reports: agrega collection_centers (insert simple, sin upsert) ─────
-- Firma y tipo de retorno idénticos a 0017 (jsonb de ids) → CREATE OR REPLACE
-- conserva los grants; igual se re-otorgan al final por claridad. Único cambio vs
-- 0017: collection_centers en v_allowed + rama de insert sin ON CONFLICT.
create or replace function ingest_reports(
  p_table       text,
  p_rows        jsonb,
  p_partner     uuid,
  p_source      text,
  p_request_id  text,
  p_ip          text,
  p_user_agent  text
) returns jsonb
language plpgsql
as $fn$
declare
  v_allowed constant text[] := array['checkins','help_requests','help_offers','damaged_reports','collection_centers'];
  v_row     jsonb;
  v_cols    text;
  v_vals    text;
  v_updates text;
  v_after   jsonb;
  v_ids     jsonb := '[]'::jsonb;
begin
  if not (p_table = any (v_allowed)) then
    raise exception 'tabla no permitida: %', p_table;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    -- columnas = llaves del row construido. v_updates excluye las llaves de
    -- conflicto (source/external_id) — solo lo usa el upsert de las 4 tablas.
    select string_agg(quote_ident(k.key), ', '),
           string_agg('r.' || quote_ident(k.key), ', '),
           string_agg(format('%I = excluded.%I', k.key, k.key), ', ')
             filter (where k.key not in ('source', 'external_id'))
      into v_cols, v_vals, v_updates
      from jsonb_object_keys(v_row) as k(key);

    if p_table = 'collection_centers' then
      -- Sin external_id → no hay (source, external_id) como conflict target. Insert
      -- simple por id (lo genera la tabla o lo trae el row); cada postulación es una
      -- fila nueva, sin idempotencia por upsert.
      execute format(
        'insert into %1$I as t (%2$s) '
        || 'select %3$s from jsonb_populate_record(null::%1$I, $1) as r '
        || 'returning to_jsonb(t)',
        p_table, v_cols, v_vals
      ) into v_after using v_row;
    else
      -- 4 tablas de reporte: upsert idempotente por (source, external_id).
      execute format(
        'insert into %1$I as t (%2$s) '
        || 'select %3$s from jsonb_populate_record(null::%1$I, $1) as r '
        || 'on conflict (source, external_id) do update set %4$s '
        || 'returning to_jsonb(t)',
        p_table, v_cols, v_vals, v_updates
      ) into v_after using v_row;
    end if;

    insert into audit_log (partner_id, source, action, resource_table, resource_id, external_id, before, after, request_id, ip, user_agent)
      values (p_partner, p_source, 'CREATE', p_table, (v_after->>'id')::uuid, v_after->>'external_id', null, v_after, p_request_id, p_ip, p_user_agent);

    v_ids := v_ids || to_jsonb(v_after->>'id');
  end loop;

  return v_ids;
end;
$fn$;

-- ── patch_report: agrega collection_centers (update por id, ya genérico) ──────
-- El update es por id y aplica solo las columnas del patch (jsonb_populate_record)
-- → no toca source/external_id/id. Único cambio vs 0016: collection_centers en
-- v_allowed. Firma/retorno idénticos → CREATE OR REPLACE.
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
  v_allowed constant text[] := array['checkins','help_requests','help_offers','damaged_reports','collection_centers'];
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
    return null; -- no existe → el caller responde 404 / no-op
  end if;

  select string_agg(format('%I = r.%I', k.key, k.key), ', ')
    into v_set
    from jsonb_object_keys(p_patch) as k(key);
  if v_set is null then
    return v_before; -- patch vacío (defensa; el caller ya lo evita)
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

-- ── delete_report: borrado real auditado (action=DELETE) ─────────────────────
-- El admin borra de verdad reportes (las 4 tablas) y centros de acopio. Captura
-- el snapshot `before` (con lock FOR UPDATE para no carrear con un update), borra,
-- y audita DELETE con after=null — todo en la misma transacción. Devuelve la fila
-- borrada (jsonb) o null si el id no existía (→ no-op en el caller). Funciona para
-- collection_centers (sin external_id → v_before->>'external_id' es null).
create or replace function delete_report(
  p_table       text,
  p_id          uuid,
  p_partner     uuid,
  p_source      text,
  p_request_id  text,
  p_ip          text,
  p_user_agent  text
) returns jsonb
language plpgsql
as $fn$
declare
  v_allowed constant text[] := array['checkins','help_requests','help_offers','damaged_reports','collection_centers'];
  v_before  jsonb;
begin
  if not (p_table = any (v_allowed)) then
    raise exception 'tabla no permitida: %', p_table;
  end if;

  execute format('select to_jsonb(t) from %I as t where t.id = $1 for update', p_table)
    into v_before using p_id;
  if v_before is null then
    return null; -- no existe → no-op (el caller no falla)
  end if;

  execute format('delete from %I where id = $1', p_table) using p_id;

  insert into audit_log (partner_id, source, action, resource_table, resource_id, external_id, before, after, request_id, ip, user_agent)
    values (p_partner, p_source, 'DELETE', p_table, p_id, v_before->>'external_id', v_before, null, p_request_id, p_ip, p_user_agent);

  return v_before;
end;
$fn$;

-- Las funciones se llaman SOLO server-side con el service key. Se revoca EXECUTE a
-- público (anon/authenticated no las invocan vía PostgREST) y se otorga a
-- service_role. Idempotente: re-aplica las de ingest/patch (los grants ya estaban)
-- y agrega delete_report (nueva).
revoke execute on function ingest_reports(text, jsonb, uuid, text, text, text, text) from public;
revoke execute on function patch_report(text, uuid, jsonb, uuid, text, text, text, text) from public;
revoke execute on function delete_report(text, uuid, uuid, text, text, text, text) from public;
grant execute on function ingest_reports(text, jsonb, uuid, text, text, text, text) to service_role;
grant execute on function patch_report(text, uuid, jsonb, uuid, text, text, text, text) to service_role;
grant execute on function delete_report(text, uuid, uuid, text, text, text, text) to service_role;

insert into applied_migrations (version) values ('0018') on conflict do nothing;
