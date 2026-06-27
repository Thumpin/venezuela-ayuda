-- 0020 · Super-admin role
--
-- Adds a privilege tier on top of the flat admin allowlist. Regular admins keep
-- all moderation (verify/hide/delete reports & centers); SUPER-admins additionally
-- can: create/remove admins, issue/revoke API keys (colaboradores), and run the
-- batch data-dump ingest. Gating is enforced in server actions (requireSuperAdmin).

alter table admin_emails
  add column if not exists is_super_admin boolean not null default false;

-- Bootstrap: the original seeded admin becomes the first super-admin. New
-- super-admins are promoted from the UI thereafter.
update admin_emails set is_super_admin = true where email = 'shinji.256@gmail.com';

insert into applied_migrations (version) values ('0020') on conflict do nothing;
