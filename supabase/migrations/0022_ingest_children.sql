-- 0022 · ingest_reports admite la tabla unaccompanied_children
--
-- El alta de un niño no acompañado (server action submitFoundChild) escribe por
-- la MISMA RPC auditada que el resto de reportes, para que toda mutación de datos
-- sensibles de menores quede en audit_log (QUIÉN/QUÉ/snapshot). La única
-- diferencia con 0017 es agregar 'unaccompanied_children' al allowlist `v_allowed`.
--
-- El tipo de retorno no cambia (jsonb) → basta CREATE OR REPLACE; el cuerpo es
-- idéntico al de 0017 salvo el array v_allowed.

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
  v_allowed constant text[] := array['checkins','help_requests','help_offers','damaged_reports','unaccompanied_children'];
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

    v_ids := v_ids || to_jsonb(v_after->>'id');
  end loop;

  return v_ids;
end;
$fn$;

revoke execute on function ingest_reports(text, jsonb, uuid, text, text, text, text) from public;
grant execute on function ingest_reports(text, jsonb, uuid, text, text, text, text) to service_role;

insert into applied_migrations (version) values ('0022') on conflict do nothing;
