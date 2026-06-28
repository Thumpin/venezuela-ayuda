-- Migrate photo_url columns from full Supabase public storage URLs to bare
-- storage paths so the app can generate short-lived signed URLs (issue #70).
--
-- Before: "https://<project>.supabase.co/storage/v1/object/public/checkin-photos/uuid.jpg"
-- After:  "uuid.jpg"
--
-- MANUAL STEP REQUIRED after deploying: set the checkin-photos bucket to
-- private in the Supabase dashboard (Storage → checkin-photos → Make private).
-- Until that is done, the existing public URLs still work and the signed-URL
-- code path is exercised only for new uploads.

UPDATE checkins
  SET photo_url = regexp_replace(photo_url, '^.+/object/public/checkin-photos/', '')
  WHERE photo_url IS NOT NULL
    AND photo_url LIKE '%/object/public/checkin-photos/%';

UPDATE damaged_reports
  SET photo_url = regexp_replace(photo_url, '^.+/object/public/checkin-photos/', '')
  WHERE photo_url IS NOT NULL
    AND photo_url LIKE '%/object/public/checkin-photos/%';
