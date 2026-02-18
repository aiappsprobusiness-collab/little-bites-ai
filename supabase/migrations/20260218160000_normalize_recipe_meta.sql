-- Backfill recipe metadata: meal_type and tags for chat_ai/week_ai so pool (fillDay/fillWeek) sees them.
-- Only touches AI recipes; does not change seed/manual/other source.
--
-- Test plan after deploy:
-- 1) Generate recipe in chat for breakfast -> recipes has meal_type='breakfast' and tags contains 'chat','chat_breakfast'
-- 2) Fill week -> new recipes have tags ['week_ai','week_breakfast'] etc. and meal_type set
-- 3) fillDay/fillWeek see recipes from both sources in pool (filter by meal_type)

BEGIN;

-- 1) chat_ai: set meal_type from tags when meal_type IS NULL
UPDATE public.recipes r
SET meal_type = sub.meal_type
FROM (
  SELECT id,
    CASE
      WHEN tags @> ARRAY['chat_breakfast']::text[] THEN 'breakfast'
      WHEN tags @> ARRAY['chat_lunch']::text[] THEN 'lunch'
      WHEN tags @> ARRAY['chat_dinner']::text[] THEN 'dinner'
      WHEN tags @> ARRAY['chat_snack']::text[] THEN 'snack'
      ELSE NULL
    END AS meal_type
  FROM public.recipes
  WHERE source = 'chat_ai'
    AND meal_type IS NULL
    AND tags IS NOT NULL
) sub
WHERE r.id = sub.id
  AND sub.meal_type IS NOT NULL;

-- 2) week_ai: set tags from meal_type when tags empty/null and meal_type set
UPDATE public.recipes
SET tags = ARRAY['week_ai', 'week_' || meal_type]::text[]
WHERE source = 'week_ai'
  AND meal_type IS NOT NULL
  AND (tags IS NULL OR array_length(tags, 1) IS NULL OR array_length(tags, 1) = 0);

-- 3) Log counts of rows that could not be fixed (for follow-up)
DO $$
DECLARE
  chat_null_meal int;
  week_null_meal int;
  week_empty_tags int;
BEGIN
  SELECT count(*) INTO chat_null_meal FROM public.recipes WHERE source = 'chat_ai' AND meal_type IS NULL;
  SELECT count(*) INTO week_null_meal FROM public.recipes WHERE source = 'week_ai' AND meal_type IS NULL;
  SELECT count(*) INTO week_empty_tags FROM public.recipes WHERE source = 'week_ai' AND (tags IS NULL OR array_length(tags, 1) IS NULL OR array_length(tags, 1) = 0);
  RAISE NOTICE 'normalize_recipe_meta: chat_ai with meal_type still NULL = %, week_ai with meal_type NULL = %, week_ai with empty tags = %', chat_null_meal, week_null_meal, week_empty_tags;
END $$;

COMMIT;
