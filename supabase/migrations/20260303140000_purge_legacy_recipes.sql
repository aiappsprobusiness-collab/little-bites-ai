-- Purge legacy recipes: leave only recipes matching new schema (age ranges, description/steps/chef_advice).
-- Tables that reference recipes (from migrations): favorites_v2, meal_plans_v2, chat_history, share_refs,
-- meal_plans (optional), shopping_list_items (optional), recipe_steps, recipe_ingredients.
-- Optional tables checked via information_schema. One-time cleanup; test DB only.

-- Step 1: temp table with recipe ids to purge (all that do NOT match KEEP)
DROP TABLE IF EXISTS _purge_legacy_recipe_ids;
CREATE TEMP TABLE _purge_legacy_recipe_ids AS
SELECT id FROM public.recipes
WHERE id NOT IN (
  SELECT r.id
  FROM public.recipes r
  WHERE r.min_age_months IS NOT NULL
    AND r.max_age_months IS NOT NULL
    AND r.min_age_months <= r.max_age_months
    AND (
      (r.min_age_months = 6   AND r.max_age_months = 12)
      OR (r.min_age_months = 12  AND r.max_age_months = 60)
      OR (r.min_age_months = 60  AND r.max_age_months = 216)
      OR (r.min_age_months = 216 AND r.max_age_months = 1200)
    )
    AND r.meal_type IN ('breakfast', 'lunch', 'snack', 'dinner')
    AND r.title IS NOT NULL AND length(btrim(r.title)) >= 3
    AND r.description IS NOT NULL AND length(btrim(r.description)) >= 60
    AND r.chef_advice IS NOT NULL AND length(btrim(r.chef_advice)) >= 60
    AND (
      (r.steps IS NOT NULL AND jsonb_typeof(r.steps) = 'array' AND jsonb_array_length(r.steps) BETWEEN 6 AND 10
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(r.steps) AS s(step) WHERE length(btrim(s.step)) < 20))
      OR ((SELECT count(*) FROM public.recipe_steps rs WHERE rs.recipe_id = r.id) BETWEEN 6 AND 10
        AND NOT EXISTS (SELECT 1 FROM public.recipe_steps rs2 WHERE rs2.recipe_id = r.id AND length(btrim(COALESCE(rs2.instruction, ''))) < 20))
    )
    AND NOT (
      r.max_age_months = 12
      AND ((COALESCE(r.title, '') || ' ' || COALESCE(r.description, '') || ' ' || COALESCE(r.chef_advice, '')) ILIKE '%свинин%'
        OR (COALESCE(r.title, '') || ' ' || COALESCE(r.description, '') || ' ' || COALESCE(r.chef_advice, '')) ILIKE '%говядин%'
        OR (COALESCE(r.title, '') || ' ' || COALESCE(r.description, '') || ' ' || COALESCE(r.chef_advice, '')) ILIKE '%стейк%'
        OR (COALESCE(r.title, '') || ' ' || COALESCE(r.description, '') || ' ' || COALESCE(r.chef_advice, '')) ILIKE '%жарен%'
        OR (COALESCE(r.title, '') || ' ' || COALESCE(r.description, '') || ' ' || COALESCE(r.chef_advice, '')) ILIKE '%отбивн%'
        OR (COALESCE(r.title, '') || ' ' || COALESCE(r.description, '') || ' ' || COALESCE(r.chef_advice, '')) ILIKE '%копчен%'
        OR (COALESCE(r.title, '') || ' ' || COALESCE(r.description, '') || ' ' || COALESCE(r.chef_advice, '')) ILIKE '%колбас%'
        OR (COALESCE(r.title, '') || ' ' || COALESCE(r.description, '') || ' ' || COALESCE(r.chef_advice, '')) ILIKE '%бекон%')
    )
);

-- Step 2: clean references (order avoids FK issues where applicable)
-- meal_plans_v2: JSONB meals; for test DB remove all rows
DELETE FROM public.meal_plans_v2;

DELETE FROM public.favorites_v2
WHERE recipe_id IN (SELECT id FROM _purge_legacy_recipe_ids);

UPDATE public.chat_history SET recipe_id = NULL
WHERE recipe_id IN (SELECT id FROM _purge_legacy_recipe_ids);

DELETE FROM public.share_refs
WHERE recipe_id IN (SELECT id FROM _purge_legacy_recipe_ids);

-- Optional tables: only if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'meal_plans') THEN
    DELETE FROM public.meal_plans WHERE recipe_id IN (SELECT id FROM _purge_legacy_recipe_ids);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shopping_list_items') THEN
    DELETE FROM public.shopping_list_items WHERE recipe_id IN (SELECT id FROM _purge_legacy_recipe_ids);
  END IF;
END $$;

-- Step 3: dependent tables (recipe_steps, recipe_ingredients)
DELETE FROM public.recipe_steps
WHERE recipe_id IN (SELECT id FROM _purge_legacy_recipe_ids);

DELETE FROM public.recipe_ingredients
WHERE recipe_id IN (SELECT id FROM _purge_legacy_recipe_ids);

-- Step 4: delete purged recipes
DELETE FROM public.recipes
WHERE id IN (SELECT id FROM _purge_legacy_recipe_ids);

DROP TABLE _purge_legacy_recipe_ids;

-- Sanity (run manually after migration if needed):
-- SELECT count(*) AS total_recipes FROM public.recipes;
-- SELECT min_age_months, max_age_months, count(*) FROM public.recipes GROUP BY 1, 2 ORDER BY 1, 2;
-- SELECT count(*) AS legacy_6_36 FROM public.recipes WHERE min_age_months = 6 AND max_age_months = 36;
-- SELECT count(*) AS null_age FROM public.recipes WHERE min_age_months IS NULL OR max_age_months IS NULL;
