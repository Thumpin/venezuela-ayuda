-- 0015 · Multi-signal dedup ENGINE (ported from the emergenciavzla "brain")
--
-- venezuela-ayuda becomes the central source of truth; the emergenciavzla repo
-- (a pipeline lab) is being deprecated. This migration brings over its strongest
-- asset: a 5-signal scorer that ranks how likely two person records are the same
-- — phonetics + name trigrams + zone + AI embedding cosine + reporter phone —
-- and feeds the results into the merge_candidates REVIEW QUEUE (0014). Nothing is
-- auto-merged: even the hardest match is queued for a human, just in a higher
-- tier ("muy parecidos") so admins triage the near-certain pairs first.
--
-- Adapts the engine to THIS schema: it scores `checkins` rows (people) instead
-- of raw_ingest. PostGIS is already present (0001). We add the missing pieces:
-- pgvector, fuzzystrmatch (phonetics), pg_trgm + unaccent (tolerant name match).

-- 1. Extensions the engine needs (postgis/pgcrypto already enabled in 0001) -----
create extension if not exists vector;        -- pgvector: semantic name+context match
create extension if not exists fuzzystrmatch; -- dmetaphone: 'Figueroa' ~ 'Figuera'
create extension if not exists pg_trgm;       -- trigram similarity() for names
create extension if not exists unaccent;      -- accent-insensitive normalization

-- 2. Triage tier on the review queue ------------------------------------------
-- The "hard" signal (same phone + compatible names) is NOT auto-merged here —
-- the user wants everything human-confirmed — but it IS a different kind of
-- candidate: near-certain. tier lets /admin show those first as a "muy parecidos"
-- lane, separate from the merely-plausible REVIEW pairs.
do $$ begin
  create type merge_tier as enum ('HARD', 'STRONG', 'REVIEW');
exception when duplicate_object then null; end $$;

alter table merge_candidates
  add column if not exists tier merge_tier not null default 'REVIEW';
alter table merge_candidates
  add column if not exists evidence jsonb;

-- Pending queue, highest tier + confidence first.
create index if not exists merge_candidates_triage_idx
  on merge_candidates (status, tier, confidence desc)
  where status = 'PENDING';

-- 3. Blocking + AI columns on checkins ----------------------------------------
-- Populated by the trigger below (SQL-native parts) and by the embed backfill
-- script (the embedding, which calls OpenAI). vector(1024) = text-embedding-3-
-- small with dimensions=1024 — keep in sync with scripts/embed-checkins.mjs.
alter table checkins
  add column if not exists name_normalized     text,
  add column if not exists name_phonetic_codes text[],   -- dmetaphone per name token
  add column if not exists phone_last7          text,    -- last 7 digits of phone_private
  add column if not exists geohash6             text,    -- ~1.2km cell for zone blocking
  add column if not exists embedding            vector(1024),
  add column if not exists embedding_model      text;

-- HNSW cosine index for semantic neighbors. Partial: only rows with an embedding
-- and not hidden (moderated-out rows don't need matching).
create index if not exists checkins_embedding_hnsw
  on checkins using hnsw (embedding vector_cosine_ops)
  where embedding is not null and hidden = false;

-- GIN over the phonetic-code array for the `&&` (overlap) blocking join.
create index if not exists checkins_phonetic_idx
  on checkins using gin (name_phonetic_codes)
  where name_phonetic_codes is not null;

create index if not exists checkins_phone7_idx on checkins (phone_last7) where phone_last7 is not null;
create index if not exists checkins_geohash6_idx on checkins (geohash6) where geohash6 is not null;

-- 4. Normalization helpers (pure SQL, deterministic) --------------------------
-- Canonical name key: unaccent + uppercase + collapsed whitespace.
create or replace function va_norm_key(p text) returns text
language sql immutable as $$
  select trim(regexp_replace(upper(unaccent(coalesce(p, ''))), '\s+', ' ', 'g'))
$$;

-- dmetaphone code set for the significant tokens of a name (length >= 3). Used
-- as the phonetic blocking key. Array so two names block if ANY token rhymes.
create or replace function va_phonetic_codes(p text) returns text[]
language sql immutable as $$
  select coalesce(
    array_agg(distinct dmetaphone(tok)) filter (where length(tok) >= 3 and dmetaphone(tok) <> ''),
    '{}')
  from unnest(string_to_array(lower(unaccent(coalesce(p, ''))), ' ')) as tok
$$;

-- geohash6 (~1.2 km) from lat/lng, or null. PostGIS st_geohash on a point.
create or replace function va_geohash6(lat double precision, lng double precision) returns text
language sql immutable as $$
  select case
    when lat is null or lng is null then null
    else st_geohash(st_setsrid(st_makepoint(lng, lat), 4326), 6)
  end
$$;

-- 5. Trigger: populate the SQL-native blocking keys on insert/update ----------
-- The embedding is NOT set here (it needs an external API call); the backfill
-- script fills it. We (re)compute name/phone/geo keys whenever those inputs
-- change, so blocking stays correct without a separate batch job.
create or replace function checkins_fill_blocking() returns trigger
language plpgsql as $$
begin
  new.name_normalized     := va_norm_key(new.name);
  new.name_phonetic_codes := va_phonetic_codes(new.name);
  new.phone_last7         := nullif(right(regexp_replace(coalesce(new.phone_private, ''), '\D', '', 'g'), 7), '');
  new.geohash6            := va_geohash6(new.latitude, new.longitude);
  return new;
end $$;

drop trigger if exists trg_checkins_fill_blocking on checkins;
create trigger trg_checkins_fill_blocking
  before insert or update of name, phone_private, latitude, longitude on checkins
  for each row execute function checkins_fill_blocking();

-- 6. The 5-signal pair scorer (ported from score_ingest_pair) -----------------
-- Returns score 0..1, a `hard` flag, a risk tag, and evidence jsonb. The phone
-- rule is the subtle one: the phone belongs to the REPORTER, not the missing
-- person — one reporter files several relatives under one number — so "same
-- phone" is only a hard signal when names are also compatible; if names clearly
-- differ it's the same reporter / different people → field_conflict, never hard.
create or replace function score_checkin_pair(a checkins, b checkins)
returns table (score real, hard boolean, risk text, evidence jsonb)
language plpgsql stable as $$
declare
  s          real := 0;
  v_name_sim real := 0;
  v_phon     boolean := false;
  v_samezone boolean := false;
  v_dist_km  double precision := null;
  v_cos      real := null;
  v_risk     text := 'text';
  v_hard     boolean := false;
begin
  v_name_sim := similarity(coalesce(a.name_normalized, ''), coalesce(b.name_normalized, ''));

  -- Reporter-phone rule.
  if a.phone_last7 is not null and a.phone_last7 = b.phone_last7 then
    if a.name_normalized is null or b.name_normalized is null or v_name_sim >= 0.6 then
      return query select 1.0::real, true, 'text',
        jsonb_build_object('phone_match', true, 'name_sim', round(v_name_sim::numeric, 3));
      return;
    else
      return query select 0.80::real, false, 'field_conflict',
        jsonb_build_object('phone_match', true, 'name_sim', round(v_name_sim::numeric, 3),
                           'note', 'same reporter phone, different names');
      return;
    end if;
  end if;

  -- Phonetic surname/token overlap.
  v_phon := a.name_phonetic_codes && b.name_phonetic_codes;
  if v_phon then s := s + 0.35; end if;

  -- Full-name trigram similarity.
  s := s + 0.40 * v_name_sim;

  -- Zone: same geohash6, else short distance between points.
  if a.geohash6 is not null and a.geohash6 = b.geohash6 then
    v_samezone := true; s := s + 0.15;
  elsif a.location is not null and b.location is not null then
    v_dist_km := st_distance(a.location, b.location) / 1000.0;
    if v_dist_km <= 2 then v_samezone := true; s := s + 0.10; end if;
  end if;

  -- AI: embedding cosine (meaning of name + context). This is the most
  -- discriminating signal when phone/zone don't apply — validated on 42k real
  -- records: 71% of the false "phonetic bridge" pairs that used to chain
  -- unrelated people into one giant cluster have cosine < 0.5. So cosine is BOTH
  -- a positive signal AND a VETO: when both rows are embedded and the meaning
  -- clearly diverges (cos < 0.45), they are different people regardless of how
  -- much the surname rhymes — cap the score so the pair can't reach the queue.
  -- Cheap-asymmetric-cost: a missed merge is recoverable, a wrong one is not.
  if a.embedding is not null and b.embedding is not null then
    v_cos := (1 - (a.embedding <=> b.embedding))::real;  -- 1 = identical
    if v_cos < 0.45 then
      -- Semantic veto: surname/zone overlap but different meaning → not a dup.
      return query select least(0.40, s)::real, false, 'semantic_mismatch',
        jsonb_build_object('name_sim', round(v_name_sim::numeric, 3),
                           'cosine', round(v_cos::numeric, 3), 'veto', 'cosine');
      return;
    end if;
    s := s + 0.30 * greatest(0, v_cos);
  end if;

  return query select least(1.0, greatest(0, s))::real, v_hard, v_risk,
    jsonb_build_object(
      'name_sim',  round(v_name_sim::numeric, 3),
      'phonetic',  v_phon,
      'same_zone', v_samezone,
      'dist_km',   case when v_dist_km is null then null else round(v_dist_km::numeric, 2) end,
      'cosine',    case when v_cos is null then null else round(v_cos::numeric, 3) end,
      'method',    'sql_cross'
    );
end $$;

-- 7. Engine pass: block, score, and QUEUE candidates (never merge) ------------
-- Scans external checkins, blocks on phonetic/geo/phone, scores each candidate
-- pair once (a.id < b.id to avoid (A,B)+(B,A) work), and inserts PENDING rows
-- into merge_candidates with a triage tier:
--   hard signal (phone+name)        → tier HARD,   confidence 1.0
--   score >= 0.90                   → tier STRONG
--   0.75 <= score < 0.90            → tier REVIEW
--   score < 0.75                    → ignored
-- keep_id = the richer row (has photo > longer message > earlier created_at).
-- Idempotent: the pair unique index + ignore-duplicates means re-runs are cheap.
--
-- Default review floor is 0.75 (NOT 0.55): validated on 42k real records, a 0.55
-- floor chained unrelated people through shared phonetic blocks into one cluster
-- of 26,550. At 0.75 the largest cluster drops to ~20 and merges are real. The
-- cosine veto in score_checkin_pair handles the cases 0.75 alone would miss.
create or replace function run_dedup_engine(p_min_review real default 0.75, p_auto real default 0.90)
returns table (scanned int, queued int)
language plpgsql security definer set search_path = public as $$
declare
  a checkins;
  b checkins;
  sc record;
  v_scanned int := 0;
  v_queued  int := 0;
  v_keep uuid; v_dup uuid; v_tier merge_tier;
begin
  for a in
    select * from checkins where source is not null and hidden = false
  loop
    v_scanned := v_scanned + 1;
    for b in
      select * from checkins c
      where c.id <> a.id
        and c.source is not null and c.hidden = false
        and c.id > a.id   -- order pairs once
        and (
              (a.name_phonetic_codes is not null and c.name_phonetic_codes && a.name_phonetic_codes)
           or (a.geohash6 is not null and c.geohash6 = a.geohash6)
           or (a.phone_last7 is not null and c.phone_last7 = a.phone_last7)
        )
    loop
      select * into sc from score_checkin_pair(a, b);
      if sc.score < p_min_review then continue; end if;

      -- Skip exact dedup_key collisions: the destructive cleanup owns those.
      if a.dedup_key is not null and a.dedup_key = b.dedup_key then continue; end if;

      v_tier := case
        when sc.hard then 'HARD'::merge_tier
        when sc.score >= p_auto then 'STRONG'::merge_tier
        else 'REVIEW'::merge_tier end;

      -- keep = richer row.
      if (case when a.photo_url is not null then 1 else 0 end,
          coalesce(length(a.message), 0), b.created_at)
         >= (case when b.photo_url is not null then 1 else 0 end,
             coalesce(length(b.message), 0), a.created_at)
      then v_keep := a.id; v_dup := b.id;
      else v_keep := b.id; v_dup := a.id;
      end if;

      insert into merge_candidates (table_name, keep_id, dup_id, confidence, reason, tier, evidence)
        values ('checkins', v_keep, v_dup, sc.score, 'engine', v_tier, sc.evidence)
        on conflict (table_name, pair_lo, pair_hi) do nothing;
      if found then v_queued := v_queued + 1; end if;
    end loop;
  end loop;

  return query select v_scanned, v_queued;
end $$;
