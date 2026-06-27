do $$ begin
  create type merge_status as enum ('PENDING', 'MERGED', 'REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type merge_tier as enum ('HARD', 'STRONG', 'REVIEW');
exception when duplicate_object then null; end $$;

create table if not exists merge_candidates (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  keep_id     uuid not null,
  dup_id      uuid not null,
  confidence  double precision not null,
  reason      text not null default 'fuzzy-name',
  status      merge_status not null default 'PENDING',
  tier        merge_tier not null default 'REVIEW',
  evidence    jsonb,
  assigned_to text,
  assigned_at timestamptz,
  decided_by  text,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- Unique pair indexing
alter table merge_candidates
  add column if not exists pair_lo uuid generated always as (least(keep_id, dup_id)) stored;
alter table merge_candidates
  add column if not exists pair_hi uuid generated always as (greatest(keep_id, dup_id)) stored;

create unique index if not exists merge_candidates_pair_idx
  on merge_candidates (table_name, pair_lo, pair_hi);

create index if not exists merge_candidates_pending_idx
  on merge_candidates (status, confidence desc)
  where status = 'PENDING';

-- Admin notifications table
create table if not exists admin_notifications (
  id           uuid primary key default gen_random_uuid(),
  checkin_id   uuid not null,
  manage_token text not null,
  type         text not null,
  message      text not null,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Grant select/insert/update/delete permissions
grant select, insert, update, delete on merge_candidates to anon, authenticated;
grant select, insert, update, delete on admin_notifications to anon, authenticated;
