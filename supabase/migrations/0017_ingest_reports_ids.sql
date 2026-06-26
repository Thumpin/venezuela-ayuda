-- 0017 · ingest_reports devuelve los ids upserted (en orden de fila)
--
-- El endpoint POST /api/v1/reports necesita devolverle al socio el id canónico
-- del hub de cada reporte creado (campo `report_id`). El RPC 0016 solo devolvía
-- el #filas (integer), así que los ids generados (gen_random_uuid en insert, o el
-- existente en update) nunca llegaban a la ruta. Acá el RPC pasa a devolver un
-- arreglo jsonb de ids EN EL MISMO ORDEN que `p_rows` → la ruta los correlaciona
-- posicionalmente (el cliente ya conoce sus external_id; no hace falta re-emitirlos).
--
-- Cambiar el tipo de retorno (integer → jsonb) no lo permite CREATE OR REPLACE:
-- hay que DROP + recrear y re-otorgar los privilegios (el drop los borra). El
-- cuerpo es idéntico al de 0016 salvo la acumulación/retorno de ids.

drop function if exists ingest_reports(text, jsonb, uuid, text, text, text, text);

create function ingest_reports(
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
  v_allowed constant text[] := array['checkins','help_requests','help_offers','damaged_reports'];
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

    -- ids EN ORDEN de p_rows (jsonb_array_elements preserva el orden del arreglo)
    -- → la ruta hace zip posicional rows[k] ↔ ids[k].
    v_ids := v_ids || to_jsonb(v_after->>'id');
  end loop;

  return v_ids;
end;
$fn$;

-- CREATE FUNCTION otorga EXECUTE a PUBLIC por default; se revoca para que
-- anon/authenticated no la invoquen vía PostgREST saltándose el auth del endpoint.
revoke execute on function ingest_reports(text, jsonb, uuid, text, text, text, text) from public;
grant execute on function ingest_reports(text, jsonb, uuid, text, text, text, text) to service_role;

insert into applied_migrations (version) values ('0017') on conflict do nothing;
