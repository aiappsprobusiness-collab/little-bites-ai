-- Сливочное масло — категория dairy, не fats.
-- 1) infer_ingredient_category: сливочн в dairy (проверка до fats), убрать сливочн из fats.
-- 2) Backfill: записи с сливочным маслом в fats перевести в dairy.

CREATE OR REPLACE FUNCTION public.infer_ingredient_category(name_clean text)
RETURNS public.product_category
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  n text;
BEGIN
  IF name_clean IS NULL OR trim(name_clean) = '' THEN
    RETURN 'other'::public.product_category;
  END IF;
  n := lower(trim(name_clean));
  IF n ~ '(говядин|свинин|баранин|индейк|куриц|фарш|котлет|яйц)' THEN RETURN 'meat'::public.product_category; END IF;
  IF n ~ '(рыба|лосос|треск|тунец|семг|форел)' THEN RETURN 'fish'::public.product_category; END IF;
  -- dairy: сливк (сливки), сливочн (сливочное масло)
  IF n ~ '(молок|кефир|йогурт|творог|сыр|сметан|сливк|сливочн)' THEN RETURN 'dairy'::public.product_category; END IF;
  IF n ~ '(круп|овсян|греч|рис|макарон|паста|мука|лапш|манн|сухар|пшён)' THEN RETURN 'grains'::public.product_category; END IF;
  IF n ~ '(морков|кабач|тыкв|капуст|картоф|лук|огур|помидор|томат|перец|баклажан|горох|фасол|чеснок|сельдер|шпинат|салат|редис|свекл|редиск|броккол|цветн|зелен|цукин|гриб|шампиньон|спарж)' THEN RETURN 'vegetables'::public.product_category; END IF;
  IF n ~ '(яблок|банан|груш|ягод|клубник|лимон|изюм)' THEN RETURN 'fruits'::public.product_category; END IF;
  -- fats: только растительные/оливковые масла, без сливочного (оно в dairy)
  IF n ~ '(масло|оливк|растительн)' THEN RETURN 'fats'::public.product_category; END IF;
  IF n ~ '(соль|перец|специи|укроп|петруш|лавр)' THEN RETURN 'spices'::public.product_category; END IF;
  RETURN 'other'::public.product_category;
END;
$$;

COMMENT ON FUNCTION public.infer_ingredient_category(text) IS 'Category from name+display_text. Butter (сливочное масло) -> dairy; other oils -> fats.';

-- Backfill 1: перевести в dairy все ингредиенты, где по новой логике infer = dairy, а сейчас category = fats (сливочное масло)
UPDATE public.recipe_ingredients ri
SET category = 'dairy'::public.product_category
WHERE ri.category = 'fats'::public.product_category
  AND public.infer_ingredient_category(btrim(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, ''))) = 'dairy'::public.product_category;

-- Backfill 2: где infer даёт конкретную категорию (не other), привести сохранённую к ней (в т.ч. сливочное масло в fruits → dairy)
UPDATE public.recipe_ingredients ri
SET category = public.infer_ingredient_category(btrim(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, '')))
WHERE public.infer_ingredient_category(btrim(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, ''))) <> 'other'::public.product_category
  AND ri.category IS DISTINCT FROM public.infer_ingredient_category(btrim(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, '')));
