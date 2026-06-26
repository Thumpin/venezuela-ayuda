-- 0014 · Merge candidates — fuzzy dedup as a REVIEW QUEUE (suggest, never delete)
--
-- The cleanup pass in scripts/ingest.mjs only removes EXACT dedup_key collisions.
-- The fuzzy matcher (clusterNames, Jaro-Winkler >= 0.95 with unit veto) is built
-- and tested in dedup-lib.mjs but was deliberately NOT wired to destructive
-- deletion: a wrong merge erases real data (unacceptable), a missed merge just
-- leaves a recoverable duplicate. This table is the safe middle ground — the
-- fuzzy matcher proposes near-duplicate pairs here for an admin to confirm or
-- reject. Nothing is mutated until a human acts.
--
-- Server-only: RLS on, no policies, no grants (same model as admin_emails /
-- sightings). Only the server (secret key) reads/writes it.

do $$ begin
  create type merge_status as enum ('PENDING', 'MERGED', 'REJECTED');
exception when duplicate_object then null; end $$;

create table if not exists merge_candidates (
  id          uuid primary key default gen_random_uuid(),
  -- Which table the two rows live in ('checkins' | 'damaged_reports').
  table_name  text not null,
  -- keep_id = the richer row we'd keep; dup_id = the one we'd retire on merge.
  -- The suggester picks keep/dup by the same score() the cleanup uses (photo >
  -- detailed source > longer text > earliest), so a confirmed merge matches the
  -- import's idea of "the canonical copy".
  keep_id     uuid not null,
  dup_id      uuid not null,
  -- Calibrated confidence from nameConfidence (>= 0.95 to be queued at all).
  confidence  double precision not null,
  -- How the pair was found: 'fuzzy-name' now; 'semantic' once embeddings land.
  reason      text not null default 'fuzzy-name',
  status      merge_status not null default 'PENDING',
  -- Audit trail for human decisions.
  decided_by  text,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- One row per unordered pair: normalize so (A,B) and (B,A) can't both be queued.
-- We always store the smaller uuid in pair_lo for a stable unique key.
alter table merge_candidates
  add column if not exists pair_lo uuid generated always as (least(keep_id, dup_id)) stored;
alter table merge_candidates
  add column if not exists pair_hi uuid generated always as (greatest(keep_id, dup_id)) stored;

create unique index if not exists merge_candidates_pair_idx
  on merge_candidates (table_name, pair_lo, pair_hi);

-- The review queue reads PENDING ordered by confidence desc.
create index if not exists merge_candidates_pending_idx
  on merge_candidates (status, confidence desc)
  where status = 'PENDING';

-- Server-only. No policies → anon/authenticated cannot see proposed merges
-- (which reference internal ids and could leak who-matches-whom).
alter table merge_candidates enable row level security;
