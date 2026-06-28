-- 0022 · Rate-limit durable (store compartido) — cierra #38
--
-- El limiter in-memory (`Map` por lambda) no es efectivo en serverless: cada
-- instancia tiene su propio contador y se resetea al reciclarse, así que el
-- límite global es evadible (basta repartir las requests entre instancias).
-- Este contador vive en la DB → es **global entre instancias**. Ventana fija.
-- Se llama SOLO server-side con el service key (execute revocado a public).

create table if not exists rate_limit (
  key      text primary key,           -- p.ej. "classify:<ip>"
  count    integer not null default 0,
  reset_at timestamptz not null
);

-- Tabla interna: nadie del lado público la toca. RLS sin policies = deny; el
-- service key la opera (bypassa RLS). Misma postura que el resto del esquema.
alter table rate_limit enable row level security;
revoke all on table rate_limit from anon, authenticated;
grant all on table rate_limit to service_role;

-- Índice para que la limpieza de filas expiradas sea barata (y acota el costo
-- de no dejar crecer la tabla / su índice primario indefinidamente).
create index if not exists rate_limit_reset_at_idx on rate_limit (reset_at);

-- Cuenta un hit y dice si se permite. Devuelve (allowed, retry_after en seg).
-- Semántica idéntica al limiter in-memory: hasta `p_limit` hits por ventana de
-- `p_window_sec`. El conteo es atómico vía UPSERT (insert ... on conflict do
-- update): sin select-for-update separado → sin carreras entre lectura y
-- escritura, y sin filas "perdidas" si la limpieza corre en paralelo.
create or replace function rate_limit_hit(p_key text, p_limit int, p_window_sec int)
returns table(allowed boolean, retry_after int)
language plpgsql
as $fn$
declare
  v_now   timestamptz := now();
  v_count integer;
  v_reset timestamptz;
begin
  insert into rate_limit (key, count, reset_at)
    values (p_key, 1, v_now + make_interval(secs => p_window_sec))
  on conflict (key) do update set
    -- ventana vencida → reiniciar (1er hit de la nueva ventana); si no, +1
    count = case when rate_limit.reset_at <= v_now then 1 else rate_limit.count + 1 end,
    reset_at = case when rate_limit.reset_at <= v_now
                    then v_now + make_interval(secs => p_window_sec)
                    else rate_limit.reset_at end
  returning count, reset_at into v_count, v_reset;

  -- Limpieza oportunista y ACOTADA: ~1% de las llamadas borra filas expiradas
  -- (usa el índice por reset_at; LIMIT para no pagar barridas grandes en un
  -- request). Best-effort: el bloque de excepción evita que un fallo/deadlock
  -- de la limpieza aborte el conteo. Mantiene la tabla acotada sin cron externo.
  if random() < 0.01 then
    begin
      delete from rate_limit
       where ctid in (select ctid from rate_limit where reset_at < v_now limit 500);
    exception when others then
      null;
    end;
  end if;

  if v_count > p_limit then
    return query select false, greatest(0, ceil(extract(epoch from (v_reset - v_now)))::int);
  else
    return query select true, 0;
  end if;
end $fn$;

revoke execute on function rate_limit_hit(text, int, int) from public;
grant execute on function rate_limit_hit(text, int, int) to service_role;

insert into applied_migrations (version) values ('0022') on conflict do nothing;
