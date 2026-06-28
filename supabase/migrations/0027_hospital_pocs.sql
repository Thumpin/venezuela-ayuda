-- 0027 · Hospital POCs — authorization model (issue #78)
--
-- A Point of Contact (POC) is a verified person authorized to report supply
-- status for one or more hospitals. POCs are linked to an api_partners key so
-- the existing API key auth flow gates their writes without a separate login.
--
-- Privacy rules:
--   - contact_private is NEVER projected publicly (phone/email)
--   - display_name is public but carries a badge clarifying it represents
--     "verified participation", NOT government endorsement or certification
--   - Revocation leaves the row with revoked_at set and active = false;
--     the record is kept for audit continuity

-- ── hospital_pocs ─────────────────────────────────────────────────────────────

create table if not exists hospital_pocs (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid references api_partners (id) on delete set null,
  display_name    text not null,     -- PUBLIC label for the verified participant badge
  role            text not null default 'reporter'
                    check (role in ('reporter', 'verifier', 'admin')),
  contact_private text,              -- PRIVATE: phone/email, never exposed
  active          boolean not null default true,
  expires_at      timestamptz,       -- optional hard expiry for temporary POCs
  revoked_at      timestamptz,       -- set on revocation; active flips to false
  revoked_reason  text,              -- internal audit note on why access was revoked
  created_at      timestamptz not null default now()
);

create index if not exists hospital_pocs_partner_idx on hospital_pocs (partner_id);
alter table hospital_pocs enable row level security;
revoke insert, update, delete on hospital_pocs from anon, authenticated;

-- ── hospital_poc_assignments ──────────────────────────────────────────────────
-- A POC can be authorized for multiple hospitals; a hospital can have multiple
-- POCs. This junction table makes the many-to-many explicit and auditable.

create table if not exists hospital_poc_assignments (
  poc_id      uuid not null references hospital_pocs (id) on delete cascade,
  hospital_id uuid not null references hospitals (id) on delete cascade,
  granted_at  timestamptz not null default now(),
  primary key (poc_id, hospital_id)
);

alter table hospital_poc_assignments enable row level security;
revoke insert, update, delete on hospital_poc_assignments from anon, authenticated;

-- ── Add poc_id onto hospital_supply_status ───────────────────────────────────
-- Records which POC last confirmed or submitted each status row.
-- Nullable: external/automated ingestion rows won't have a POC.

alter table hospital_supply_status
  add column if not exists poc_id uuid references hospital_pocs (id) on delete set null;

create index if not exists hss_poc_idx on hospital_supply_status (poc_id);

-- ── Authorization helper ──────────────────────────────────────────────────────
-- Returns true if the given partner key has an active, non-expired POC assigned
-- to the given hospital. Called server-side before accepting a supply write.

create or replace function poc_can_write_hospital(
  p_partner_id uuid,
  p_hospital_id uuid
) returns boolean
language sql stable
as $$
  select exists (
    select 1
    from hospital_pocs poc
    join hospital_poc_assignments a on a.poc_id = poc.id
    where poc.partner_id  = p_partner_id
      and a.hospital_id   = p_hospital_id
      and poc.active      = true
      and poc.revoked_at  is null
      and (poc.expires_at is null or poc.expires_at > now())
  );
$$;

revoke execute on function poc_can_write_hospital(uuid, uuid) from public;
grant  execute on function poc_can_write_hospital(uuid, uuid) to service_role;

-- ── Public view: POC badge (no contact, no revocation notes) ─────────────────

create or replace view public_hospital_pocs as
  select poc.id, poc.display_name, poc.role, a.hospital_id, poc.created_at
  from hospital_pocs poc
  join hospital_poc_assignments a on a.poc_id = poc.id
  where poc.active = true
    and poc.revoked_at is null
    and (poc.expires_at is null or poc.expires_at > now());

grant select on public_hospital_pocs to anon, authenticated;

insert into applied_migrations (version) values ('0027') on conflict do nothing;
