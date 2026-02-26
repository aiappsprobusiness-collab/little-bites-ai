-- Диагностика рецептов с выбросами по canonical_amount (мясо/рыба > 1500g, молочные жидкости > 2500ml, крупы > 3000g).
-- Один запрос: сгруппировано по recipe_id, max canonical_amount, title, servings_base, meal_type, created_at.
-- Используется для ручной проверки и как основа для миграции исправления servings_base.

CREATE OR REPLACE VIEW public.recipes_outlier_ingredients_diagnostic AS
WITH outlier_rows AS (
  SELECT
    ri.recipe_id,
    ri.canonical_amount,
    ri.canonical_unit,
    ri.category,
    CASE
      WHEN ri.category IN ('meat', 'fish') AND COALESCE(ri.canonical_unit, 'g') = 'g' AND (ri.canonical_amount::numeric) > 1500 THEN 'meat_fish'
      WHEN ri.category = 'dairy' AND ri.canonical_unit = 'ml' AND (ri.canonical_amount::numeric) > 2500 THEN 'dairy_liquid'
      WHEN ri.category = 'grains' AND (ri.canonical_unit IS NULL OR ri.canonical_unit = 'g') AND (ri.canonical_amount::numeric) > 3000 THEN 'grains'
      ELSE NULL
    END AS outlier_type
  FROM public.recipe_ingredients ri
  WHERE ri.canonical_amount IS NOT NULL
),
recipe_max_outlier AS (
  SELECT
    recipe_id,
    MAX(canonical_amount::numeric) AS max_canonical_amount
  FROM outlier_rows
  WHERE outlier_type IS NOT NULL
  GROUP BY recipe_id
)
SELECT
  r.id AS recipe_id,
  r.title,
  r.servings_base,
  r.meal_type,
  r.created_at,
  rm.max_canonical_amount
FROM public.recipes r
JOIN recipe_max_outlier rm ON r.id = rm.recipe_id
ORDER BY rm.max_canonical_amount DESC;

COMMENT ON VIEW public.recipes_outlier_ingredients_diagnostic IS
  'Recipes with outlier ingredient amounts: meat/fish > 1500g, dairy liquid > 2500ml, grains > 3000g. For diagnostics and fix_recipe_servings_base_outliers.';
