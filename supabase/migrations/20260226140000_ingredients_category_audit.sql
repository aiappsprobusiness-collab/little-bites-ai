-- Диагностика категорий ингредиентов: масштаб other, топ other по частоте, примеры meat/veg в other.

-- 1) Одна строка: общие счётчики
CREATE OR REPLACE VIEW public.ingredients_category_audit AS
SELECT
  count(*)::int AS total_ingredients,
  count(*) FILTER (WHERE category = 'other')::int AS other_count,
  round(100.0 * count(*) FILTER (WHERE category = 'other') / nullif(count(*), 0), 2) AS other_pct
FROM public.recipe_ingredients;

COMMENT ON VIEW public.ingredients_category_audit IS
  'One row: total_ingredients, other_count, other_pct. Use ingredients_category_audit_top_other / _meat_like / _veg_like for examples.';

-- 2) Топ-100 ингредиентов по частоте, где category = other (canonical_unit g/ml/pcs/tsp/tbsp или NULL)
CREATE OR REPLACE VIEW public.ingredients_category_audit_top_other AS
SELECT
  name,
  display_text,
  category,
  canonical_unit,
  count(*) AS cnt
FROM public.recipe_ingredients
WHERE category = 'other'
  AND (canonical_unit IS NULL OR canonical_unit IN ('g', 'ml', 'pcs', 'tsp', 'tbsp'))
GROUP BY name, display_text, category, canonical_unit
ORDER BY count(*) DESC
LIMIT 100;

-- 3) Примеры meat/fish-like при category = other (для ручной проверки)
CREATE OR REPLACE VIEW public.ingredients_category_audit_meat_like_other AS
SELECT id, recipe_id, name, display_text, category, canonical_unit
FROM public.recipe_ingredients
WHERE category = 'other'
  AND (
    name ILIKE '%свин%' OR name ILIKE '%кур%' OR name ILIKE '%говя%'
    OR name ILIKE '%индей%' OR name ILIKE '%теля%' OR name ILIKE '%фарш%'
    OR name ILIKE '%лосос%' OR name ILIKE '%семг%' OR name ILIKE '%рыб%'
    OR name ILIKE '%тунец%' OR display_text ILIKE '%свин%' OR display_text ILIKE '%кур%'
    OR display_text ILIKE '%говя%' OR display_text ILIKE '%лосос%' OR display_text ILIKE '%рыб%'
  )
LIMIT 100;

-- 4) Примеры vegetable-like при category = other
CREATE OR REPLACE VIEW public.ingredients_category_audit_veg_like_other AS
SELECT id, recipe_id, name, display_text, category, canonical_unit
FROM public.recipe_ingredients
WHERE category = 'other'
  AND (
    name ILIKE '%морков%' OR name ILIKE '%кабач%' OR name ILIKE '%перец%'
    OR name ILIKE '%лук%' OR name ILIKE '%брокк%' OR name ILIKE '%цветн%'
    OR name ILIKE '%картоф%' OR name ILIKE '%огурц%' OR name ILIKE '%помидор%'
    OR name ILIKE '%тыкв%' OR display_text ILIKE '%морков%' OR display_text ILIKE '%кабач%'
    OR display_text ILIKE '%перец%' OR display_text ILIKE '%лук%' OR display_text ILIKE '%картоф%'
  )
LIMIT 100;
