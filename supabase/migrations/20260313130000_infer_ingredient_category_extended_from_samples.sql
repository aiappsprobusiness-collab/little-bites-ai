-- Правила категорий по примерам из БД (recipe_ingredients с category = other).
-- Добавляем паттерны: яйца→meat, лапша/манная/сухари/пшён→grains, салат/цукини/грибы/спаржа→vegetables,
-- изюм/лимон→fruits, растительное масло→fats, лавровый→spices. Затем backfill.

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
  -- meat: + яйц (яйцо, яйца)
  IF n ~ '(говядин|свинин|баранин|индейк|куриц|фарш|котлет|яйц)' THEN RETURN 'meat'::public.product_category; END IF;
  IF n ~ '(рыба|лосос|треск|тунец|семг|форел)' THEN RETURN 'fish'::public.product_category; END IF;
  IF n ~ '(молок|кефир|йогурт|творог|сыр|сметан|сливк)' THEN RETURN 'dairy'::public.product_category; END IF;
  -- grains: + лапш (лапша), манн (манная), сухар (сухари), пшён (пшённая крупа)
  IF n ~ '(круп|овсян|греч|рис|макарон|паста|мука|лапш|манн|сухар|пшён)' THEN RETURN 'grains'::public.product_category; END IF;
  -- vegetables: + цукин (цукини), гриб (грибы), шампиньон (шампиньоны), спарж (спаржа)
  IF n ~ '(морков|кабач|тыкв|капуст|картоф|лук|огур|помидор|томат|перец|баклажан|горох|фасол|чеснок|сельдер|шпинат|салат|редис|свекл|редиск|броккол|цветн|зелен|цукин|гриб|шампиньон|спарж)' THEN RETURN 'vegetables'::public.product_category; END IF;
  -- fruits: + лимон, изюм
  IF n ~ '(яблок|банан|груш|ягод|клубник|лимон|изюм)' THEN RETURN 'fruits'::public.product_category; END IF;
  -- fats: + растительн (растительное масло)
  IF n ~ '(масло|оливк|сливочн|растительн)' THEN RETURN 'fats'::public.product_category; END IF;
  -- spices: + лавр (лавровый лист)
  IF n ~ '(соль|перец|специи|укроп|петруш|лавр)' THEN RETURN 'spices'::public.product_category; END IF;
  RETURN 'other'::public.product_category;
END;
$$;

COMMENT ON FUNCTION public.infer_ingredient_category(text) IS 'Category from name+display_text. Extended: meat+яйц, grains+лапш|манн|сухар|пшён, vegetables+цукин|гриб|шампиньон|спарж, fruits+лимон|изюм, fats+растительн, spices+лавр.';

-- Backfill: пересчитать category для всех, где сейчас other, по новой логике
UPDATE public.recipe_ingredients ri
SET category = public.infer_ingredient_category(btrim(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, '')))
WHERE ri.category = 'other'::public.product_category
  AND public.infer_ingredient_category(btrim(COALESCE(ri.name, '') || ' ' || COALESCE(ri.display_text, ''))) <> 'other'::public.product_category;
