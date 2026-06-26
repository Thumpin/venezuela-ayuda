-- 0016 · "No estoy seguro" — a DEFERRED lane for the dedup review queue
--
-- A reviewer who can't decide a block right now needs to set it aside WITHOUT
-- losing it (REJECTED would bury it forever; leaving it PENDING keeps it on top
-- of the main queue, in the way). DEFERRED is that middle state: the block drops
-- out of the main PENDING queue but stays reviewable via a "dudosos" filter, and
-- can be sent back to PENDING later.
--
-- The existing partial indexes are `where status = 'PENDING'`, so they keep
-- working unchanged — DEFERRED rows simply aren't in them.
--
-- This migration only ADDS the enum value. We intentionally do NOT also create an
-- index with `where status = 'DEFERRED'` here: a newly-added enum value can't be
-- referenced in the same transaction it was added in (Postgres restriction), so
-- such an index would fail when the file is applied as one transaction (e.g. the
-- Supabase SQL editor). The deferred lane is small and read with a plain
-- status + table_name filter, so it needs no dedicated index.

alter type merge_status add value if not exists 'DEFERRED';
