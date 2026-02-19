-- assign_recipe_to_plan_slot: возвращать id и meals после upsert; проверять, что слот реально записан.
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
  v_meals jsonb;
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
    RETURNING id, meals INTO v_row_id, v_meals;
  ELSE
    INSERT INTO meal_plans_v2 (user_id, member_id, planned_date, meals)
    VALUES (v_user_id, p_member_id, (p_day_key::date), jsonb_build_object(v_meal_type, v_new_slot))
    ON CONFLICT (user_id, member_id, planned_date) WHERE member_id IS NOT NULL
    DO UPDATE SET meals = COALESCE(meal_plans_v2.meals, '{}'::jsonb) || COALESCE(EXCLUDED.meals, '{}'::jsonb)
    RETURNING id, meals INTO v_row_id, v_meals;
  END IF;

  IF v_meals IS NULL OR NOT (v_meals ? v_meal_type) OR (v_meals->v_meal_type->>'recipe_id') IS NULL THEN
    RAISE EXCEPTION 'assign_failed_slot_not_saved';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row_id,
    'planned_date', p_day_key,
    'meal_type', v_meal_type,
    'recipe_id', p_recipe_id,
    'title', v_new_slot->>'title',
    'meals', v_meals
  );
END;
$$;

COMMENT ON FUNCTION public.assign_recipe_to_plan_slot(uuid, text, text, uuid, text) IS 'Upsert + merge; returns id, meals; raises if slot not in meals after merge.';
