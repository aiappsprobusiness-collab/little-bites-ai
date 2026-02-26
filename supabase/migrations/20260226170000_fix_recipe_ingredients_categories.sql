-- Массовое обновление recipe_ingredients.category по name и display_text.
-- Только строки с category = 'other'. Остальные не трогаем. Логируем количество обновлённых.

DO $$
DECLARE
  rows_meat int;
  rows_fish int;
  rows_vegetables int;
  rows_fruits int;
  rows_dairy int;
  rows_grains int;
  rows_fats int;
  rows_spices int;
  total_updated int;
BEGIN
  -- Поиск по объединённому name + display_text (как при записи)
  UPDATE public.recipe_ingredients ri
  SET category = 'meat'::public.product_category
  WHERE ri.category = 'other'
    AND (
      lower(btrim(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, ''))) ~ '(говядин|свинин|баранин|индейк|куриц|фарш|котлет|телятин|окорок|грудинк|шея|колбас|сосиск|бекон|ветчин)'
    );
  GET DIAGNOSTICS rows_meat = ROW_COUNT;

  UPDATE public.recipe_ingredients ri
  SET category = 'fish'::public.product_category
  WHERE ri.category = 'other'
    AND (
      lower(btrim(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, ''))) ~ '(рыба|лосос|треск|тунец|семг|форел|карп|судак|минтай|сельд|скумбр|кальмар|креветк|краб|икра)'
    );
  GET DIAGNOSTICS rows_fish = ROW_COUNT;

  UPDATE public.recipe_ingredients ri
  SET category = 'dairy'::public.product_category
  WHERE ri.category = 'other'
    AND (
      lower(btrim(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, ''))) ~ '(молок|кефир|йогурт|творог|сыр|сметан|сливк|ряженк|простокваш)'
    );
  GET DIAGNOSTICS rows_dairy = ROW_COUNT;

  UPDATE public.recipe_ingredients ri
  SET category = 'grains'::public.product_category
  WHERE ri.category = 'other'
    AND (
      lower(btrim(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, ''))) ~ '(круп|овсян|греч|рис|макарон|паста|мука|лапш|хлеб|сухар|булгур|киноа|перлов)'
    );
  GET DIAGNOSTICS rows_grains = ROW_COUNT;

  UPDATE public.recipe_ingredients ri
  SET category = 'vegetables'::public.product_category
  WHERE ri.category = 'other'
    AND (
      lower(btrim(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, ''))) ~ '(морков|кабач|тыкв|капуст|картоф|лук|огурц|помидор|перец|баклажан|горох|фасол|чеснок|сельдер|шпинат|салат|редис|свекл|редиск|броккол|цветн|зелен)'
    );
  GET DIAGNOSTICS rows_vegetables = ROW_COUNT;

  UPDATE public.recipe_ingredients ri
  SET category = 'fruits'::public.product_category
  WHERE ri.category = 'other'
    AND (
      lower(btrim(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, ''))) ~ '(яблок|банан|груш|ягод|клубник|черник|малин|виноград|слив|абрикос|персик|манго|апельсин|лимон|мандарин|киви|авокадо|гранат|инжир)'
    );
  GET DIAGNOSTICS rows_fruits = ROW_COUNT;

  UPDATE public.recipe_ingredients ri
  SET category = 'fats'::public.product_category
  WHERE ri.category = 'other'
    AND (
      lower(btrim(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, ''))) ~ '(масло|оливк|сливочн|подсолнечн|растительн)'
    );
  GET DIAGNOSTICS rows_fats = ROW_COUNT;

  UPDATE public.recipe_ingredients ri
  SET category = 'spices'::public.product_category
  WHERE ri.category = 'other'
    AND (
      lower(btrim(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, ''))) ~ '(соль|перец|специи|укроп|петруш|базилик|кинза|кориандр|лавр|гвоздик|кориц|имбир|паприк|орегано|тимьян|мята)'
    );
  GET DIAGNOSTICS rows_spices = ROW_COUNT;

  total_updated := rows_meat + rows_fish + rows_dairy + rows_grains + rows_vegetables + rows_fruits + rows_fats + rows_spices;
  RAISE NOTICE 'fix_recipe_ingredients_categories: meat=%, fish=%, dairy=%, grains=%, vegetables=%, fruits=%, fats=%, spices=%, total=%',
    rows_meat, rows_fish, rows_dairy, rows_grains, rows_vegetables, rows_fruits, rows_fats, rows_spices, total_updated;
END;
$$;
