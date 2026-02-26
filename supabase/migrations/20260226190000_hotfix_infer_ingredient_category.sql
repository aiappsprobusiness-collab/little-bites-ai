-- Hotfix: infer_ingredient_category снова определяет meat/dairy/vegetables/... (не только fish).
-- Причина: 20260228120000_functions_set_search_path перезаписала функцию урезанной версией;
-- паттерны вроде "куриц" не матчат "куриное филе" (нужны основы "кур", "свин" и т.д.).
-- Яйца: оставляем other (при желании можно отнести к meat как продукт животного происхождения).

CREATE OR REPLACE FUNCTION public.infer_ingredient_category(name_clean text)
RETURNS public.product_category
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  txt text;
BEGIN
  txt := lower(btrim(coalesce(name_clean, '')));
  IF txt = '' THEN
    RETURN 'other'::public.product_category;
  END IF;

  -- fish -> meat -> dairy -> vegetables -> fruits -> grains -> spices -> fats -> other

  -- Порядок проверок важен (более специфичные категории раньше при конфликтах).
  IF txt ~ '(рыб|лосос|семг|форел|тунец|треск|сельд|скумбр|кальмар|кревет|краб|икр)' THEN
    RETURN 'fish'::public.product_category;
  END IF;
  IF txt ~ '(кур|свин|говя|индей|теля|фарш|вырезк|шея|грудин|бекон|окорок|филе)' THEN
    RETURN 'meat'::public.product_category;
  END IF;
  IF txt ~ '(молок|творог|йогурт|кефир|сыр|сливк|сметан|масло слив)' THEN
    RETURN 'dairy'::public.product_category;
  END IF;
  IF txt ~ '(морков|кабач|перец|лук|броккол|цветн|картоф|огурц|помидор|тыкв|баклажан|фасол|горох|шпинат)' THEN
    RETURN 'vegetables'::public.product_category;
  END IF;
  IF txt ~ '(яблок|банан|груш|ягод|черник|малина|клубник|слив)' THEN
    RETURN 'fruits'::public.product_category;
  END IF;
  IF txt ~ '(рис|греч|овсян|хлоп|мук|макарон|пшено|перлов|булгур)' THEN
    RETURN 'grains'::public.product_category;
  END IF;
  IF txt ~ '(соль|перец черн|паприк|куркум|корица|ванил|ореган|базилик|укроп|петруш|розмарин|тимьян|чеснок)' THEN
    RETURN 'spices'::public.product_category;
  END IF;
  IF txt ~ '(масло раст|оливк|подсолнеч|сливочн(?!.*масло слив)|гхи)' THEN
    RETURN 'fats'::public.product_category;
  END IF;

  RETURN 'other'::public.product_category;
END;
$$;

COMMENT ON FUNCTION public.infer_ingredient_category(text) IS
  'Category from ingredient name/display_text (Russian stems). Order: fish->meat->dairy->vegetables->fruits->grains->spices->fats->other.';

-- Self-test
SELECT
  infer_ingredient_category('Куриное филе 500 г') AS chicken,
  infer_ingredient_category('Свиная вырезка 600 г') AS pork,
  infer_ingredient_category('Куриный бульон 500 мл') AS broth,
  infer_ingredient_category('Яйцо куриное 2 шт') AS eggs,
  infer_ingredient_category('Лосось 300 г') AS salmon;
-- Ожидание: chicken=meat, pork=meat, broth=meat (или other), salmon=fish, eggs=other
