-- favorites_v2: backfill recipe_id, enforce NOT NULL, unique (user_id, recipe_id).

-- 1. Backfill recipe_id from recipe_data where possible (valid uuid + exists in recipes)
UPDATE public.favorites_v2
SET recipe_id = (recipe_data->>'id')::uuid
WHERE recipe_id IS NULL
  AND recipe_data->>'id' IS NOT NULL
  AND (recipe_data->>'id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  AND EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = (recipe_data->>'id')::uuid);

-- 2. Remove rows that cannot be linked to a recipe
DELETE FROM public.favorites_v2 WHERE recipe_id IS NULL;

-- 3. Deduplicate: keep one row per (user_id, recipe_id), delete the rest (keep earliest by id)
DELETE FROM public.favorites_v2 a
USING public.favorites_v2 b
WHERE a.user_id = b.user_id
  AND a.recipe_id = b.recipe_id
  AND a.id > b.id;

-- 4. Drop old partial unique index (no longer needed)
DROP INDEX IF EXISTS public.idx_favorites_v2_user_recipe;

-- 5. Make recipe_id NOT NULL
ALTER TABLE public.favorites_v2
  ALTER COLUMN recipe_id SET NOT NULL;

-- 6. Add UNIQUE constraint (user_id, recipe_id)
ALTER TABLE public.favorites_v2
  ADD CONSTRAINT favorites_v2_user_recipe_key UNIQUE (user_id, recipe_id);

-- FK recipe_id -> recipes(id) already exists from 20260212110000.
