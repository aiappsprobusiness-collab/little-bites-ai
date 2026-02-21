-- Optional cleanup: run only after reviewing audit views (audit.meal_plans_broken_meals, audit.recipes_garbage_top200).
-- By default DOES NOT DELETE: set run_cleanup = true below and re-apply to execute.
-- 1) Delete meal_plans_v2 rows where meals is empty or has no valid recipe_id in any slot.
-- 2) Delete AI recipes (chat_ai/week_ai) with garbage_score >= 2 that are not in favorites_v2 and not used in meal_plans_v2.
--    Order: recipe_ingredients, recipe_steps, then recipes. favorites_v2 is never modified.

DO $$
DECLARE
  run_cleanup boolean := false;  -- set to true to perform deletes
  deleted_plans int;
  recipe_candidates bigint;
  deleted_ing int;
  deleted_steps int;
  deleted_recipes int;
BEGIN
  IF NOT run_cleanup THEN
    RAISE NOTICE 'cleanup_garbage_safe: run_cleanup=false. No changes. Set run_cleanup := true and re-run to execute.';
    RETURN;
  END IF;

  -- 1) Delete broken/empty meal_plans_v2 rows
  DELETE FROM public.meal_plans_v2
  WHERE meals IS NULL
     OR meals = '{}'::jsonb
     OR id IN (SELECT id FROM audit.meal_plans_broken_meals);
  GET DIAGNOSTICS deleted_plans = ROW_COUNT;
  RAISE NOTICE 'cleanup_garbage_safe: deleted meal_plans_v2 rows = %', deleted_plans;

  -- 2) Recipe IDs to protect: in favorites_v2 or used in any meal_plans_v2 slot
  CREATE TEMP TABLE IF NOT EXISTS _protected_recipe_ids (id uuid PRIMARY KEY);
  TRUNCATE _protected_recipe_ids;
  INSERT INTO _protected_recipe_ids (id)
  SELECT DISTINCT recipe_id FROM public.favorites_v2 WHERE recipe_id IS NOT NULL
  UNION
  SELECT DISTINCT (COALESCE(v->>'recipe_id', v->>'recipeId', v->>'id'))::uuid
  FROM public.meal_plans_v2 mp, jsonb_each(mp.meals) AS t(k, v)
  WHERE (COALESCE(v->>'recipe_id', v->>'recipeId', v->>'id')) ~ '^[0-9a-fA-F-]{36}$';

  -- 3) Candidates: chat_ai/week_ai, garbage_score >= 2, not protected
  CREATE TEMP TABLE IF NOT EXISTS _to_delete_recipes (id uuid PRIMARY KEY);
  TRUNCATE _to_delete_recipes;
  INSERT INTO _to_delete_recipes (id)
  WITH stats AS (
    SELECT
      r.id,
      (SELECT count(*) FROM public.recipe_ingredients ri WHERE ri.recipe_id = r.id) AS ing_c,
      (SELECT count(*) FROM public.recipe_steps rs WHERE rs.recipe_id = r.id) AS step_c,
      (NULLIF(trim(COALESCE(r.chef_advice, '')), '') IS NOT NULL OR NULLIF(trim(COALESCE(r.advice, '')), '') IS NOT NULL) AS has_advice
    FROM public.recipes r
    WHERE r.source IN ('chat_ai', 'week_ai')
  ),
  scored AS (
    SELECT id,
      (CASE WHEN ing_c = 0 THEN 1 ELSE 0 END
       + CASE WHEN step_c < 2 THEN 1 ELSE 0 END
       + CASE WHEN NOT has_advice THEN 1 ELSE 0 END) AS garbage_score
    FROM stats
  )
  SELECT s.id FROM scored s
  WHERE s.garbage_score >= 2
    AND s.id NOT IN (SELECT id FROM _protected_recipe_ids);

  SELECT count(*) INTO recipe_candidates FROM _to_delete_recipes;
  RAISE NOTICE 'cleanup_garbage_safe: recipe candidates to delete = %', recipe_candidates;

  DELETE FROM public.recipe_ingredients WHERE recipe_id IN (SELECT id FROM _to_delete_recipes);
  GET DIAGNOSTICS deleted_ing = ROW_COUNT;
  DELETE FROM public.recipe_steps WHERE recipe_id IN (SELECT id FROM _to_delete_recipes);
  GET DIAGNOSTICS deleted_steps = ROW_COUNT;
  DELETE FROM public.recipes WHERE id IN (SELECT id FROM _to_delete_recipes);
  GET DIAGNOSTICS deleted_recipes = ROW_COUNT;

  RAISE NOTICE 'cleanup_garbage_safe: deleted recipe_ingredients=%, recipe_steps=%, recipes=%',
    deleted_ing, deleted_steps, deleted_recipes;
END $$;
