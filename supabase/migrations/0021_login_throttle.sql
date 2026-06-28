-- 0021 · Throttle/lockout durable para el login del admin
--
-- El login (signInWithPassword) no tenía límite de intentos: el rate-limit de la
-- app es in-memory por lambda (inútil en serverless). Esto añade un contador
-- DURABLE en la DB, compartido entre instancias, para frenar fuerza bruta /
-- credential-stuffing contra /admin. Se llama SOLO server-side con el service key
-- (igual que las demás RPC); execute revocado a public.
--
-- Diseño: se cuenta por IP (no por email) para no permitir que un atacante
-- bloquee la cuenta de un admin enviando fallos con su correo (DoS de cuenta).

create table if not exists login_throttle (
  key          text primary key,           -- p.ej. "login:<ip>"
  fails        integer not null default 0, -- fallos dentro de la ventana actual
  window_start timestamptz not null default now(),
  locked_until timestamptz                 -- si > now(): bloqueado
);

-- Tabla interna: nadie del lado público la toca. RLS sin policies = deny; el
-- service key la opera (bypassa RLS). Defensa en profundidad como el resto.
alter table login_throttle enable row level security;
revoke all on table login_throttle from anon, authenticated;
grant all on table login_throttle to service_role;

-- Devuelve los segundos restantes de bloqueo (0 = permitido). Llamar ANTES de
-- intentar autenticar.
create or replace function login_guard(p_key text)
returns integer
language plpgsql
as $fn$
declare
  v_locked timestamptz;
begin
  select locked_until into v_locked from login_throttle where key = p_key;
  if v_locked is not null and v_locked > now() then
    return ceil(extract(epoch from (v_locked - now())))::int;
  end if;
  return 0;
end $fn$;

-- Registra un intento fallido. Al alcanzar p_limit dentro de p_window_sec,
-- bloquea por p_lockout_sec. Atómico (select ... for update).
create or replace function login_record_failure(
  p_key text, p_limit int, p_window_sec int, p_lockout_sec int
) returns void
language plpgsql
as $fn$
declare
  r     login_throttle%rowtype;
  v_now timestamptz := now();
begin
  insert into login_throttle (key, fails, window_start)
    values (p_key, 0, v_now)
    on conflict (key) do nothing;
  select * into r from login_throttle where key = p_key for update;
  -- ventana expirada, o lock anterior ya vencido → reiniciar el contador
  if r.window_start < v_now - make_interval(secs => p_window_sec)
     or (r.locked_until is not null and r.locked_until <= v_now) then
    update login_throttle
      set fails = 1, window_start = v_now, locked_until = null
      where key = p_key;
    return;
  end if;
  -- dentro de ventana → incrementar; al llegar al límite, bloquear
  if r.fails + 1 >= p_limit then
    update login_throttle
      set fails = 0, locked_until = v_now + make_interval(secs => p_lockout_sec)
      where key = p_key;
  else
    update login_throttle set fails = r.fails + 1 where key = p_key;
  end if;
end $fn$;

-- Limpia el contador tras un login exitoso.
create or replace function login_clear(p_key text)
returns void
language sql
as $fn$
  delete from login_throttle where key = p_key;
$fn$;

-- Las funciones se llaman SOLO server-side con el service key.
revoke execute on function login_guard(text) from public;
revoke execute on function login_record_failure(text, int, int, int) from public;
revoke execute on function login_clear(text) from public;
grant execute on function login_guard(text) to service_role;
grant execute on function login_record_failure(text, int, int, int) to service_role;
grant execute on function login_clear(text) to service_role;

insert into applied_migrations (version) values ('0021') on conflict do nothing;
