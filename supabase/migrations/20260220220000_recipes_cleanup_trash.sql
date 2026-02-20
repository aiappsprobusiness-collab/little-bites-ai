-- Safe cleanup of "bad" AI recipes: archive to trash tables, then delete in batches.
-- Criteria (ANY): A) no chef_advice AND no advice; B) steps < 2; C) ingredients < 3;
--   D) >= 2 ingredients with (canonical_amount IS NULL OR canonical_unit IS NULL) AND (display_text IS NULL OR trim = '');
--   E) title empty/NULL or no steps/ingredients links.
-- Excluded: recipes used in meal_plans_v2.meals (recipe_id in jsonb); recipes in favorites_v2.
-- Only source IN ('chat_ai', 'week_ai').

-- ========== 1. Trash tables (structure like originals + deleted_at, delete_reason) ==========
CREATE TABLE IF NOT EXISTS public.recipes_trash (
  LIKE public.recipes INCLUDING DEFAULTS
);
ALTER TABLE public.recipes_trash ADD COLUMN IF NOT EXISTS deleted_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.recipes_trash ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE TABLE IF NOT EXISTS public.recipe_steps_trash (
  LIKE public.recipe_steps INCLUDING DEFAULTS
);
ALTER TABLE public.recipe_steps_trash ADD COLUMN IF NOT EXISTS deleted_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.recipe_steps_trash ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE TABLE IF NOT EXISTS public.recipe_ingredients_trash (
  LIKE public.recipe_ingredients INCLUDING DEFAULTS
);
ALTER TABLE public.recipe_ingredients_trash ADD COLUMN IF NOT EXISTS deleted_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.recipe_ingredients_trash ADD COLUMN IF NOT EXISTS delete_reason text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipe_ingredients_trash_recipe_id_fkey') THEN
    ALTER TABLE public.recipe_ingredients_trash DROP CONSTRAINT recipe_ingredients_trash_recipe_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipe_steps_trash_recipe_id_fkey') THEN
    ALTER TABLE public.recipe_steps_trash DROP CONSTRAINT recipe_steps_trash_recipe_id_fkey;
  END IF;
END $$;

COMMENT ON TABLE public.recipes_trash IS 'Archived bad AI recipes before delete; restore from here if needed.';
COMMENT ON TABLE public.recipe_steps_trash IS 'Archived recipe_steps for trashed recipes.';
COMMENT ON TABLE public.recipe_ingredients_trash IS 'Archived recipe_ingredients for trashed recipes.';

-- ========== 2. Dry-run + archive + delete ==========
DO $$
DECLARE
  total_candidates bigint;
  in_plan_count bigint;
  in_fav_count bigint;
  to_delete_count bigint;
  trashed_recipes int;
  deleted_count int;
  batch_ids uuid[];
  batch_size int := 500;
BEGIN
  -- 2a) Recipe IDs used in meal_plans_v2.meals (any slot)
  CREATE TEMP TABLE IF NOT EXISTS _used_in_plan (recipe_id uuid PRIMARY KEY);
  TRUNCATE _used_in_plan;
  INSERT INTO _used_in_plan (recipe_id)
  SELECT DISTINCT (v->>'recipe_id')::uuid
  FROM public.meal_plans_v2 mp,
       jsonb_each(mp.meals) AS t(k, v)
  WHERE v->>'recipe_id' IS NOT NULL
    AND (v->>'recipe_id')::text ~ '^[0-9a-fA-F-]{36}$';

  SELECT count(*) INTO in_plan_count FROM _used_in_plan;

  -- 2b) Candidates: AI recipes matching ANY bad criterion, with single delete_reason (first match)
  CREATE TEMP TABLE IF NOT EXISTS _candidates (id uuid PRIMARY KEY, delete_reason text);
  TRUNCATE _candidates;

  INSERT INTO _candidates (id, delete_reason)
  SELECT r.id,
    CASE
      WHEN NULLIF(trim(COALESCE(r.title, '')), '') IS NULL THEN 'missing_title'
      WHEN NOT EXISTS (SELECT 1 FROM public.recipe_steps rs WHERE rs.recipe_id = r.id LIMIT 1)
           OR NOT EXISTS (SELECT 1 FROM public.recipe_ingredients ri WHERE ri.recipe_id = r.id LIMIT 1) THEN 'no_links'
      WHEN (SELECT count(*) FROM public.recipe_ingredients ri WHERE ri.recipe_id = r.id) < 3 THEN 'low_ingredients'
      WHEN (SELECT count(*) FROM public.recipe_steps rs WHERE rs.recipe_id = r.id) < 2 THEN 'low_steps'
      WHEN (
        SELECT count(*)
        FROM public.recipe_ingredients ri
        WHERE ri.recipe_id = r.id
          AND (ri.canonical_amount IS NULL OR ri.canonical_unit IS NULL)
          AND (ri.display_text IS NULL OR trim(COALESCE(ri.display_text, '')) = '')
      ) >= 2 THEN 'bad_canonical'
      WHEN NULLIF(trim(COALESCE(r.chef_advice, '')), '') IS NULL AND NULLIF(trim(COALESCE(r.advice, '')), '') IS NULL THEN 'no_advice'
      ELSE 'no_links'
    END
  FROM public.recipes r
  WHERE r.source IN ('chat_ai', 'week_ai')
    AND (
      (NULLIF(trim(COALESCE(r.chef_advice, '')), '') IS NULL AND NULLIF(trim(COALESCE(r.advice, '')), '') IS NULL)
      OR (SELECT count(*) FROM public.recipe_steps rs WHERE rs.recipe_id = r.id) < 2
      OR (SELECT count(*) FROM public.recipe_ingredients ri WHERE ri.recipe_id = r.id) < 3
      OR (
        (SELECT count(*)
         FROM public.recipe_ingredients ri
         WHERE ri.recipe_id = r.id
           AND (ri.canonical_amount IS NULL OR ri.canonical_unit IS NULL)
           AND (ri.display_text IS NULL OR trim(COALESCE(ri.display_text, '')) = '')) >= 2
      )
      OR NULLIF(trim(COALESCE(r.title, '')), '') IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.recipe_steps rs WHERE rs.recipe_id = r.id LIMIT 1)
      OR NOT EXISTS (SELECT 1 FROM public.recipe_ingredients ri WHERE ri.recipe_id = r.id LIMIT 1)
    );

  SELECT count(*) INTO total_candidates FROM _candidates;

  in_plan_count := (SELECT count(*) FROM _candidates c WHERE c.id IN (SELECT recipe_id FROM _used_in_plan));
  in_fav_count := (SELECT count(*) FROM _candidates c WHERE c.id IN (SELECT recipe_id FROM public.favorites_v2 WHERE recipe_id IS NOT NULL));

  -- 2c) Exclude used in plan and in favorites
  DELETE FROM _candidates c
  WHERE c.id IN (SELECT recipe_id FROM _used_in_plan)
     OR c.id IN (SELECT recipe_id FROM public.favorites_v2 WHERE recipe_id IS NOT NULL);

  SELECT count(*) INTO to_delete_count FROM _candidates;

  -- 2d) Archive to trash (bulk)
  INSERT INTO public.recipes_trash
  SELECT r.*, now(), c.delete_reason
  FROM public.recipes r
  JOIN _candidates c ON c.id = r.id;

  GET DIAGNOSTICS trashed_recipes = ROW_COUNT;

  INSERT INTO public.recipe_steps_trash
  SELECT rs.*, now(), c.delete_reason
  FROM public.recipe_steps rs
  JOIN _candidates c ON c.id = rs.recipe_id;

  INSERT INTO public.recipe_ingredients_trash
  SELECT ri.*, now(), c.delete_reason
  FROM public.recipe_ingredients ri
  JOIN _candidates c ON c.id = ri.recipe_id;

  -- 2e) Delete in batches
  deleted_count := 0;
  LOOP
    SELECT array_agg(id) INTO batch_ids FROM (SELECT id FROM _candidates LIMIT batch_size) s;
    EXIT WHEN batch_ids IS NULL OR array_length(batch_ids, 1) IS NULL;

    DELETE FROM public.recipe_steps WHERE recipe_id = ANY(batch_ids);
    DELETE FROM public.recipe_ingredients WHERE recipe_id = ANY(batch_ids);
    DELETE FROM public.recipes WHERE id = ANY(batch_ids);
    deleted_count := deleted_count + array_length(batch_ids, 1);
    DELETE FROM _candidates WHERE id = ANY(batch_ids);
  END LOOP;

  RAISE NOTICE 'recipes_cleanup_trash: total_candidates=%, skipped_in_plan=%, skipped_favorites=%, trashed=%, deleted=%',
    total_candidates, in_plan_count, in_fav_count, trashed_recipes, deleted_count;
END $$;
