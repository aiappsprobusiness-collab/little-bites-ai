-- Clean meal_plans_v2.meals (jsonb): remove or null broken recipe_id references (no FK to recipes).
-- Structure: meals is jsonb object keyed by meal type, e.g. {"breakfast":{"recipe_id":"uuid","title":"..."}, ...}.
-- Idempotent. Dry-run and real-run. Operate in transaction when p_dry_run = false.

-- ========== 1. Function: cleanup broken recipe refs in meal_plans_v2.meals ==========
CREATE OR REPLACE FUNCTION public.meal_plans_v2_cleanup_broken_recipes(
  p_dry_run boolean DEFAULT true,
  p_mode text DEFAULT 'null'
)
RETURNS TABLE (
  broken_refs_found   bigint,
  affected_rows       bigint,
  removed_items_count bigint,
  mode                text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broken_refs   bigint := 0;
  v_affected      bigint := 0;
  plan_rec        RECORD;
  new_meals       jsonb;
BEGIN
  IF p_mode NOT IN ('null', 'remove') THEN
    RAISE EXCEPTION 'meal_plans_v2_cleanup_broken_recipes: p_mode must be ''null'' or ''remove''';
  END IF;

  -- Count total broken refs (for dry run and for reporting)
  SELECT count(*)::bigint INTO v_broken_refs
  FROM public.meal_plans_v2 mp,
       jsonb_each(COALESCE(mp.meals, '{}'::jsonb)) AS t(slot_key, slot_val)
  WHERE slot_val->>'recipe_id' IS NOT NULL
    AND (slot_val->>'recipe_id')::text ~ '^[0-9a-fA-F-]{36}$'
    AND NOT EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = (slot_val->>'recipe_id')::uuid
    );

  IF p_dry_run THEN
    SELECT count(*)::bigint INTO v_affected
    FROM public.meal_plans_v2 mp
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_each(COALESCE(mp.meals, '{}'::jsonb)) AS t(slot_key, slot_val)
      WHERE slot_val->>'recipe_id' IS NOT NULL
        AND (slot_val->>'recipe_id')::text ~ '^[0-9a-fA-F-]{36}$'
        AND NOT EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = (slot_val->>'recipe_id')::uuid)
    );
    broken_refs_found   := v_broken_refs;
    affected_rows       := v_affected;
    removed_items_count := v_broken_refs;
    mode                := p_mode;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_broken_refs = 0 THEN
    broken_refs_found   := 0;
    affected_rows       := 0;
    removed_items_count := 0;
    mode                := p_mode;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Real run: update each row that has at least one broken ref
  FOR plan_rec IN
    SELECT mp.id, mp.meals
    FROM public.meal_plans_v2 mp
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_each(COALESCE(mp.meals, '{}'::jsonb)) AS t(slot_key, slot_val)
      WHERE slot_val->>'recipe_id' IS NOT NULL
        AND (slot_val->>'recipe_id')::text ~ '^[0-9a-fA-F-]{36}$'
        AND NOT EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = (slot_val->>'recipe_id')::uuid)
    )
  LOOP
    IF p_mode = 'null' THEN
      new_meals := (
        SELECT jsonb_object_agg(
          t.slot_key,
          CASE
            WHEN t.slot_val->>'recipe_id' IS NOT NULL
                 AND (t.slot_val->>'recipe_id')::text ~ '^[0-9a-fA-F-]{36}$'
                 AND NOT EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = (t.slot_val->>'recipe_id')::uuid)
            THEN jsonb_set(t.slot_val, '{recipe_id}', 'null'::jsonb)
            ELSE t.slot_val
          END
        )
        FROM jsonb_each(COALESCE(plan_rec.meals, '{}'::jsonb)) AS t(slot_key, slot_val)
      );
    ELSE
      -- p_mode = 'remove': omit slots whose recipe_id is broken
      new_meals := (
        SELECT coalesce(jsonb_object_agg(t.slot_key, t.slot_val), '{}'::jsonb)
        FROM jsonb_each(COALESCE(plan_rec.meals, '{}'::jsonb)) AS t(slot_key, slot_val)
        WHERE NOT (
          t.slot_val->>'recipe_id' IS NOT NULL
          AND (t.slot_val->>'recipe_id')::text ~ '^[0-9a-fA-F-]{36}$'
          AND NOT EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = (t.slot_val->>'recipe_id')::uuid)
        )
      );
    END IF;

    IF new_meals IS DISTINCT FROM plan_rec.meals THEN
      UPDATE public.meal_plans_v2
      SET meals = new_meals
      WHERE id = plan_rec.id;
      v_affected := v_affected + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'meal_plans_v2_cleanup_broken_recipes: broken_refs_found=%, affected_rows=%, removed_items_count=%, mode=%',
    v_broken_refs, v_affected, v_broken_refs, p_mode;

  broken_refs_found   := v_broken_refs;
  affected_rows       := v_affected;
  removed_items_count := v_broken_refs;
  mode                := p_mode;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.meal_plans_v2_cleanup_broken_recipes(boolean, text) IS
  'Clean meal_plans_v2.meals: set broken recipe_id to null (mode=null) or remove slot (mode=remove). Dry run returns counts only.';


-- ========== 2. Preview query (snippet; run manually, limit 50) ==========
-- Rows containing broken recipe_id refs:
--
--   SELECT mp.id, mp.user_id, mp.planned_date, mp.meals
--   FROM public.meal_plans_v2 mp
--   WHERE EXISTS (
--     SELECT 1
--     FROM jsonb_each(COALESCE(mp.meals, '{}'::jsonb)) AS t(slot_key, slot_val)
--     WHERE slot_val->>'recipe_id' IS NOT NULL
--       AND (slot_val->>'recipe_id')::text ~ '^[0-9a-fA-F-]{36}$'
--       AND NOT EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = (slot_val->>'recipe_id')::uuid)
--   )
--   ORDER BY mp.planned_date DESC
--   LIMIT 50;
--
-- ========== 3. Usage ==========
-- Dry run (counts only):
--   SELECT * FROM public.meal_plans_v2_cleanup_broken_recipes(true, 'null');
-- Real run (inside transaction; mode: null = set recipe_id to null, remove = drop slot):
--   BEGIN;
--   SELECT * FROM public.meal_plans_v2_cleanup_broken_recipes(false, 'null');
--   COMMIT;
