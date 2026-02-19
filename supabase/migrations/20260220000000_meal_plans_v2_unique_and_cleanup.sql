-- meal_plans_v2: одна строка на (user_id, member_id, planned_date).
-- 1) Cleanup: слить дубликаты в одну строку (main = max(id)), удалить остальные.
-- 2) Partial unique indexes: запретить повторные строки.

-- ========== 1. Cleanup: для каждой группы с count(*) > 1 оставить одну строку (max(id)), слить meals = merge всех ==========
DO $$
DECLARE
  grp RECORD;
  keeper_id uuid;
  merged_meals jsonb;
  r RECORD;
BEGIN
  FOR grp IN
    SELECT user_id, member_id, planned_date
    FROM public.meal_plans_v2
    GROUP BY user_id, member_id, planned_date
    HAVING count(*) > 1
  LOOP
    SELECT id INTO keeper_id
    FROM public.meal_plans_v2
    WHERE meal_plans_v2.user_id = grp.user_id
      AND (
        (grp.member_id IS NULL AND meal_plans_v2.member_id IS NULL)
        OR (grp.member_id IS NOT NULL AND meal_plans_v2.member_id = grp.member_id)
      )
      AND meal_plans_v2.planned_date = grp.planned_date
    ORDER BY id DESC
    LIMIT 1;

    merged_meals := '{}'::jsonb;
    FOR r IN
      SELECT id, meals
      FROM public.meal_plans_v2
      WHERE meal_plans_v2.user_id = grp.user_id
        AND (
          (grp.member_id IS NULL AND meal_plans_v2.member_id IS NULL)
          OR (grp.member_id IS NOT NULL AND meal_plans_v2.member_id = grp.member_id)
        )
        AND meal_plans_v2.planned_date = grp.planned_date
      ORDER BY id ASC
    LOOP
      merged_meals := merged_meals || COALESCE(r.meals, '{}'::jsonb);
    END LOOP;

    UPDATE public.meal_plans_v2 SET meals = merged_meals WHERE id = keeper_id;

    DELETE FROM public.meal_plans_v2
    WHERE user_id = grp.user_id
      AND (
        (grp.member_id IS NULL AND member_id IS NULL)
        OR (grp.member_id IS NOT NULL AND member_id = grp.member_id)
      )
      AND planned_date = grp.planned_date
      AND id != keeper_id;
  END LOOP;
END $$;

-- ========== 2. Partial unique: одна строка на (user_id, planned_date) для семьи (member_id IS NULL) ==========
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plans_v2_unique_family
  ON public.meal_plans_v2 (user_id, planned_date)
  WHERE member_id IS NULL;

-- ========== 3. Partial unique: одна строка на (user_id, member_id, planned_date) для члена ==========
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plans_v2_unique_member
  ON public.meal_plans_v2 (user_id, member_id, planned_date)
  WHERE member_id IS NOT NULL;

COMMENT ON INDEX public.idx_meal_plans_v2_unique_family IS 'One row per (user_id, planned_date) for family plan (member_id NULL).';
COMMENT ON INDEX public.idx_meal_plans_v2_unique_member IS 'One row per (user_id, member_id, planned_date) for member plan.';

-- ========== 4. assign_recipe_to_plan_slot: upsert + merge (не создавать новую строку при наличии) ==========
CREATE OR REPLACE FUNCTION public.assign_recipe_to_plan_slot(
  p_member_id uuid,
  p_day_key text,
  p_meal_type text,
  p_recipe_id uuid,
  p_recipe_title text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_meal_type text;
  v_row_id uuid;
  v_new_slot jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_meal_type := lower(trim(p_meal_type));
  IF v_meal_type NOT IN ('breakfast', 'lunch', 'snack', 'dinner') THEN
    RAISE EXCEPTION 'invalid_meal_type';
  END IF;

  IF p_recipe_id IS NULL THEN
    RAISE EXCEPTION 'recipe_id_required';
  END IF;

  IF p_recipe_title IS NULL OR p_recipe_title = '' THEN
    SELECT title INTO p_recipe_title
    FROM recipes
    WHERE id = p_recipe_id AND user_id = v_user_id
    LIMIT 1;
  END IF;

  v_new_slot := jsonb_build_object(
    'recipe_id', p_recipe_id,
    'title', COALESCE(NULLIF(trim(p_recipe_title), ''), 'Рецепт')
  );

  IF p_member_id IS NULL THEN
    INSERT INTO meal_plans_v2 (user_id, member_id, planned_date, meals)
    VALUES (v_user_id, NULL, (p_day_key::date), jsonb_build_object(v_meal_type, v_new_slot))
    ON CONFLICT (user_id, planned_date) WHERE member_id IS NULL
    DO UPDATE SET meals = COALESCE(meal_plans_v2.meals, '{}'::jsonb) || COALESCE(EXCLUDED.meals, '{}'::jsonb)
    RETURNING id INTO v_row_id;
  ELSE
    INSERT INTO meal_plans_v2 (user_id, member_id, planned_date, meals)
    VALUES (v_user_id, p_member_id, (p_day_key::date), jsonb_build_object(v_meal_type, v_new_slot))
    ON CONFLICT (user_id, member_id, planned_date) WHERE member_id IS NOT NULL
    DO UPDATE SET meals = COALESCE(meal_plans_v2.meals, '{}'::jsonb) || COALESCE(EXCLUDED.meals, '{}'::jsonb)
    RETURNING id INTO v_row_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row_id,
    'planned_date', p_day_key,
    'meal_type', v_meal_type,
    'recipe_id', p_recipe_id,
    'title', v_new_slot->>'title'
  );
END;
$$;

COMMENT ON FUNCTION public.assign_recipe_to_plan_slot(uuid, text, text, uuid, text) IS 'Manual assign recipe to plan slot. Upsert + jsonb merge; one row per (user_id, member_id, planned_date).';
