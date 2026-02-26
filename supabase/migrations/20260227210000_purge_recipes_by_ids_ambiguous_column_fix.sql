-- purge_recipes_by_ids: устранить неоднозначность recipe_id (RETURNS TABLE задаёт переменную, конфликт с колонками в UPDATE/DELETE).
-- Используем динамический SQL для UPDATE/DELETE по таблицам с колонкой recipe_id, чтобы ссылки были на колонки таблиц.

CREATE OR REPLACE FUNCTION public.purge_recipes_by_ids(
  p_recipe_ids uuid[],
  p_dry_run boolean DEFAULT true
)
RETURNS TABLE(
  recipe_id uuid,
  title text,
  refs_meal_plans_v2 int,
  refs_meal_plans int,
  refs_favorites int,
  refs_chat int,
  refs_shopping int,
  ingredient_rows int,
  step_rows int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_id uuid;
  v_title text;
  v_refs_mp2 int;
  v_refs_mp int;
  v_refs_fav int;
  v_refs_chat int;
  v_refs_shop int;
  v_ing int;
  v_step int;
  v_meal_plans_exists boolean;
  v_shopping_exists boolean;
BEGIN
  IF p_recipe_ids IS NULL OR array_length(p_recipe_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meal_plans'
  ) INTO v_meal_plans_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'shopping_list_items'
  ) INTO v_shopping_exists;

  FOR r_id IN SELECT unnest(p_recipe_ids)
  LOOP
    SELECT r.title INTO v_title FROM public.recipes r WHERE r.id = r_id LIMIT 1;

    SELECT count(*)::int INTO v_refs_mp2
      FROM public.meal_plans_v2 mp, jsonb_each(mp.meals) AS t(slot_key, slot_val)
      WHERE (slot_val->>'recipe_id') IS NOT NULL
        AND (slot_val->>'recipe_id')::uuid = r_id;

    IF v_meal_plans_exists THEN
      SELECT count(*)::int INTO v_refs_mp FROM public.meal_plans mp WHERE mp.recipe_id = r_id;
    ELSE
      v_refs_mp := 0;
    END IF;

    SELECT count(*)::int INTO v_refs_fav
      FROM public.favorites_v2 f WHERE f.recipe_id = r_id;

    SELECT count(*)::int INTO v_refs_chat
      FROM public.chat_history ch WHERE ch.recipe_id = r_id;

    IF v_shopping_exists THEN
      SELECT count(*)::int INTO v_refs_shop
        FROM public.shopping_list_items sli WHERE sli.recipe_id = r_id;
    ELSE
      v_refs_shop := 0;
    END IF;

    SELECT count(*)::int INTO v_ing
      FROM public.recipe_ingredients ri WHERE ri.recipe_id = r_id;

    SELECT count(*)::int INTO v_step
      FROM public.recipe_steps rs WHERE rs.recipe_id = r_id;

    recipe_id := r_id;
    title := v_title;
    refs_meal_plans_v2 := v_refs_mp2;
    refs_meal_plans := v_refs_mp;
    refs_favorites := v_refs_fav;
    refs_chat := v_refs_chat;
    refs_shopping := v_refs_shop;
    ingredient_rows := v_ing;
    step_rows := v_step;
    RETURN NEXT;
  END LOOP;

  IF p_dry_run THEN
    RETURN;
  END IF;

  TRUNCATE TABLE public.meal_plans_v2;
  IF v_meal_plans_exists THEN
    TRUNCATE TABLE public.meal_plans;
  END IF;
  TRUNCATE TABLE public.favorites_v2;

  EXECUTE 'UPDATE public.chat_history SET recipe_id = NULL WHERE recipe_id = ANY($1)' USING p_recipe_ids;
  IF v_shopping_exists THEN
    EXECUTE 'DELETE FROM public.shopping_list_items WHERE recipe_id = ANY($1)' USING p_recipe_ids;
  END IF;
  EXECUTE 'DELETE FROM public.recipe_steps WHERE recipe_id = ANY($1)' USING p_recipe_ids;
  EXECUTE 'DELETE FROM public.recipe_ingredients WHERE recipe_id = ANY($1)' USING p_recipe_ids;
  EXECUTE 'DELETE FROM public.recipes WHERE id = ANY($1)' USING p_recipe_ids;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.purge_recipes_by_ids(uuid[], boolean) IS
  'Purge recipes by ids. Skips meal_plans and shopping_list_items if tables do not exist. dry_run=true: report only.';
