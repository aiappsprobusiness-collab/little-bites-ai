-- purge_recipes_by_ids: ручное удаление набора рецептов по id с предварительным обнулением планов и избранного.
-- Вызов только вручную; dry_run по умолчанию true — ничего не меняет, только отчёт.
-- Таблицы с ссылками на recipes: meal_plans_v2 (meals jsonb), meal_plans, favorites_v2, chat_history.recipe_id, shopping_list_items.recipe_id, recipe_ingredients, recipe_steps.

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
BEGIN
  IF p_recipe_ids IS NULL OR array_length(p_recipe_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Подсчёт отчёта по каждому recipe_id (используется и в dry_run, и в real run перед удалением)
  FOR r_id IN SELECT unnest(p_recipe_ids)
  LOOP
    SELECT r.title INTO v_title FROM public.recipes r WHERE r.id = r_id LIMIT 1;

    SELECT count(*)::int INTO v_refs_mp2
      FROM public.meal_plans_v2 mp, jsonb_each(mp.meals) AS t(slot_key, slot_val)
      WHERE (slot_val->>'recipe_id') IS NOT NULL
        AND (slot_val->>'recipe_id')::uuid = r_id;

    SELECT count(*)::int INTO v_refs_mp
      FROM public.meal_plans mp WHERE mp.recipe_id = r_id;

    SELECT count(*)::int INTO v_refs_fav
      FROM public.favorites_v2 f WHERE f.recipe_id = r_id;

    SELECT count(*)::int INTO v_refs_chat
      FROM public.chat_history ch WHERE ch.recipe_id = r_id;

    SELECT count(*)::int INTO v_refs_shop
      FROM public.shopping_list_items sli WHERE sli.recipe_id = r_id;

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

  -- Real run: в одной транзакции обнулить планы/избранное, затем очистить ссылки и удалить рецепты
  -- (отчёт уже возвращён выше; в real run мы делаем изменения после того как RETURN NEXT отработал по всем id)
  TRUNCATE TABLE public.meal_plans_v2;
  TRUNCATE TABLE public.meal_plans;
  TRUNCATE TABLE public.favorites_v2;

  UPDATE public.chat_history SET recipe_id = NULL WHERE recipe_id = ANY(p_recipe_ids);
  DELETE FROM public.shopping_list_items WHERE recipe_id = ANY(p_recipe_ids);
  DELETE FROM public.recipe_steps WHERE recipe_id = ANY(p_recipe_ids);
  DELETE FROM public.recipe_ingredients WHERE recipe_id = ANY(p_recipe_ids);
  DELETE FROM public.recipes WHERE id = ANY(p_recipe_ids);

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.purge_recipes_by_ids(uuid[], boolean) IS
  'Purge recipes by ids: dry_run=true returns ref counts only; dry_run=false truncates meal_plans_v2, meal_plans, favorites_v2, then nulls chat_history.recipe_id, deletes shopping_list_items, recipe_steps, recipe_ingredients, recipes. Call manually only.';

-- Как вызывать:
-- Dry-run (ничего не меняет, только отчёт по каждому recipe_id):
--   SELECT * FROM public.purge_recipes_by_ids(ARRAY['...uuid...'::uuid], true);
-- Real run (TRUNCATE планов/избранного + удаление перечисленных рецептов и ссылок):
--   SELECT * FROM public.purge_recipes_by_ids(ARRAY['...uuid...'::uuid], false);
