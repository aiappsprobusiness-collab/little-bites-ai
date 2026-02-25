-- meal_plans_v2: add servings to each meal slot. assign_recipe_to_plan_slot sets default from recipe.

CREATE OR REPLACE FUNCTION public.assign_recipe_to_plan_slot(
  p_member_id uuid,
  p_day_key text,
  p_meal_type text,
  p_recipe_id uuid,
  p_recipe_title text DEFAULT NULL,
  p_servings integer DEFAULT NULL
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
  v_servings_base int;
  v_servings_recommended int;
  v_servings int;
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
    SELECT title, servings_base, servings_recommended
    INTO p_recipe_title, v_servings_base, v_servings_recommended
    FROM recipes
    WHERE id = p_recipe_id AND user_id = v_user_id
    LIMIT 1;
  ELSE
    SELECT servings_base, servings_recommended
    INTO v_servings_base, v_servings_recommended
    FROM recipes
    WHERE id = p_recipe_id AND user_id = v_user_id
    LIMIT 1;
  END IF;

  -- Default servings: legacy (base=5) -> 5, else servings_recommended
  IF p_servings IS NOT NULL AND p_servings >= 1 THEN
    v_servings := p_servings;
  ELSIF COALESCE(v_servings_base, 1) = 5 THEN
    v_servings := 5;
  ELSE
    v_servings := GREATEST(1, COALESCE(v_servings_recommended, 1));
  END IF;

  v_new_slot := jsonb_build_object(
    'recipe_id', p_recipe_id,
    'title', COALESCE(NULLIF(trim(p_recipe_title), ''), 'Рецепт'),
    'servings', v_servings
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
    'servings', v_servings,
    'meals', v_meals
  );
END;
$$;

COMMENT ON FUNCTION public.assign_recipe_to_plan_slot(uuid, text, text, uuid, text, integer) IS 'Upsert slot with recipe_id, title, servings (default from recipe: base=5 -> 5, else servings_recommended).';
