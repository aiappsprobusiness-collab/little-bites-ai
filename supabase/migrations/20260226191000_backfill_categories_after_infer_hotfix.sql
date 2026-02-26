-- Backfill category для записей с category = 'other' после hotfix infer_ingredient_category.
-- Используем name + display_text для вызова infer_ingredient_category.

DO $$
DECLARE
  updated_count int;
BEGIN
  UPDATE public.recipe_ingredients ri
  SET category = public.infer_ingredient_category(btrim(lower(coalesce(ri.name, '') || ' ' || coalesce(ri.display_text, ''))))
  WHERE ri.category = 'other';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'backfill_categories_after_infer_hotfix: обновлено строк с other -> новая категория: %', updated_count;
END;
$$;
