-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- Forces PostgREST to reload schema cache after migrations.
-- Use when you see: "Could not find the `X` column in the schema cache"

-- 1. DIAGNOSTIC: Verify recipe_id exists in favorites_v2
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'favorites_v2'
ORDER BY ordinal_position;

-- 2. Reload PostgREST schema cache (must be run as superuser or via DB webhook)
NOTIFY pgrst, 'reload schema';
