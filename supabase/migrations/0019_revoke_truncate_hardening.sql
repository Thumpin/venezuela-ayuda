-- 0019 · Hardening anti-wipe: revoca TRUNCATE de los roles públicos
--
-- HALLAZGO (certificación contra DB real): RLS NO cubre TRUNCATE — es un
-- privilegio de TABLA, no de fila. Las tablas del schema `public` heredaron el
-- grant TRUNCATE para anon/authenticated del default de Supabase, así que
-- cualquiera con el anon key (público, viaja en el frontend) podía:
--   · `truncate audit_log`          → borrar TODA la traza (anula la inmutabilidad)
--   · `truncate help_offers` etc.   → vaciar los reportes
-- RLS bloquea INSERT/SELECT/UPDATE/DELETE de anon, pero NO el TRUNCATE. La
-- migración 0016 revocó update/delete (que de todos modos cubre RLS) pero dejó
-- TRUNCATE abierto.
--
-- FIX: revoca TRUNCATE de todas las tablas del schema public, y cierra audit_log
-- por completo a los roles públicos (es una tabla interna — el endpoint
-- /reports/{id}/history la lee con el service key, que bypassa RLS y no depende
-- de estos grants). Las RPC corren como service_role y no se ven afectadas. Las
-- vistas public_* (lo único que anon debe leer) conservan su SELECT.
revoke truncate on all tables in schema public from anon, authenticated;
revoke all on table audit_log from anon, authenticated;

insert into applied_migrations (version) values ('0019') on conflict do nothing;
