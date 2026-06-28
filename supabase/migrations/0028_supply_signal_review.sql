-- 0028 · Supply signal review queue (#80 #81)
--
-- Anonymous/social signals (X, Threads, screenshots, WhatsApp) must not
-- automatically promote to confirmed hospital supply status. This migration
-- adds a `pending_supply_signals` staging table where such signals land and
-- wait for human review before being promoted (or dismissed).
--
-- Relationship to hospital_supply_status:
--   CONFIRMED rows in hospital_supply_status are the canonical public truth.
--   pending_supply_signals are pre-canonical observations awaiting review.
--   On promotion, the reviewer writes a CONFIRMED row and marks the signal
--   as PROMOTED here (soft link via promoted_to_status_id).
--
-- Provenance fields added here go beyond what hospital_supply_status tracks:
--   source_platform, capture_url, content_fingerprint, visibility, raw_text.
--   These let reviewers judge credibility without needing the original signal.

-- ── pending_supply_signals ────────────────────────────────────────────────────

create table if not exists pending_supply_signals (
  id                    uuid primary key default gen_random_uuid(),
  hospital_id           uuid references hospitals (id) on delete set null,
  category              text check (category in ('SUPPLIES', 'BEDS', 'STAFF', 'EQUIPMENT')),
  reported_status       text check (reported_status in ('green', 'yellow', 'red', 'unknown')),

  -- Provenance (#80)
  source_platform       text,   -- 'x' | 'threads' | 'whatsapp' | 'screenshot' | 'anonymous' | 'phone'
  source_type           text not null default 'anonymous'
                          check (source_type in ('confirmed_poc', 'verified_partner', 'public', 'anonymous', 'social')),
  capture_url           text,   -- URL of the original post/screenshot (may be null for private msgs)
  capture_timestamp     timestamptz, -- when the signal was originally posted
  content_fingerprint   text,   -- hash/slug to detect duplicate submissions
  visibility            text not null default 'internal'
                          check (visibility in ('public', 'internal')), -- whether to show on map as unconfirmed
  raw_text              text,   -- original text content (reviewer evidence, NEVER public)
  submitter_source      text,   -- partner source that submitted this signal
  partner_id            uuid references api_partners (id) on delete set null,

  -- Review workflow (#81)
  review_status         text not null default 'pending'
                          check (review_status in ('pending', 'promoted', 'dismissed', 'needs_verification', 'flagged_duplicate')),
  reviewer_notes        text,   -- PRIVATE: reviewer's reasoning
  reviewed_by           text,   -- reviewer identifier (admin email or system)
  reviewed_at           timestamptz,
  promoted_to_status_id uuid references hospital_supply_status (id) on delete set null,

  -- Freshness
  expires_at            timestamptz,  -- unverified signals auto-expire
  created_at            timestamptz not null default now()
);

create index if not exists pss_hospital_idx on pending_supply_signals (hospital_id, review_status);
create index if not exists pss_fingerprint_idx on pending_supply_signals (content_fingerprint) where content_fingerprint is not null;
create index if not exists pss_review_status_idx on pending_supply_signals (review_status, created_at);
alter table pending_supply_signals enable row level security;
revoke insert, update, delete on pending_supply_signals from anon, authenticated;

-- ── Reviewer actions RPC ──────────────────────────────────────────────────────
-- Atomically updates a signal's review_status + writes audit log.
-- Promotion is a two-step: the reviewer separately calls the supply write API
-- with confidence_level CONFIRMED; this function only closes the signal.

create or replace function review_supply_signal(
  p_signal_id       uuid,
  p_review_status   text,
  p_reviewer        text,
  p_notes           text,
  p_promoted_id     uuid,   -- supply_status id if promoting, else null
  p_partner_id      uuid,
  p_request_id      text,
  p_ip              text,
  p_user_agent      text
) returns jsonb
language plpgsql
as $fn$
declare
  v_allowed_statuses constant text[] := array['promoted', 'dismissed', 'needs_verification', 'flagged_duplicate'];
  v_before  jsonb;
  v_after   jsonb;
begin
  if not (p_review_status = any (v_allowed_statuses)) then
    raise exception 'review_status inválido: %', p_review_status;
  end if;

  select to_jsonb(s) into v_before from pending_supply_signals s where s.id = p_signal_id for update;
  if v_before is null then
    return null;
  end if;

  update pending_supply_signals
    set review_status         = p_review_status,
        reviewer_notes        = p_notes,
        reviewed_by           = p_reviewer,
        reviewed_at           = now(),
        promoted_to_status_id = p_promoted_id
  where id = p_signal_id
  returning to_jsonb(pending_supply_signals.*) into v_after;

  insert into audit_log (partner_id, source, action, resource_table, resource_id, before, after, request_id, ip, user_agent)
    values (p_partner_id, 'admin', 'UPDATE', 'pending_supply_signals', p_signal_id, v_before, v_after, p_request_id, p_ip, p_user_agent);

  return v_after;
end;
$fn$;

revoke execute on function review_supply_signal(uuid, text, text, text, uuid, uuid, text, text, text) from public;
grant  execute on function review_supply_signal(uuid, text, text, text, uuid, uuid, text, text, text) to service_role;

-- ── Public view: non-sensitive signals marked visibility='public' ─────────────
-- Only signals with visibility='public' appear here — reviewer has explicitly
-- allowed the map to display this as an unconfirmed observation.
-- raw_text, reviewer_notes, capture_url are NEVER projected.

create or replace view public_supply_signals as
  select
    s.id,
    s.hospital_id,
    s.category,
    s.reported_status,
    s.source_platform,
    s.source_type,
    s.capture_timestamp,
    s.review_status,
    s.expires_at,
    s.created_at,
    h.name  as hospital_name,
    h.state as hospital_state,
    h.city  as hospital_city
  from pending_supply_signals s
  left join hospitals h on h.id = s.hospital_id
  where s.visibility = 'public'
    and s.review_status in ('pending', 'needs_verification')
    and (s.expires_at is null or s.expires_at > now());

grant select on public_supply_signals to anon, authenticated;

insert into applied_migrations (version) values ('0028') on conflict do nothing;
