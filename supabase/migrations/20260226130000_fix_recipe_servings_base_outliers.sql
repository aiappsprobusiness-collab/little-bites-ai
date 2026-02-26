-- Исправление выбросов в старых рецептах: только увеличиваем recipes.servings_base,
-- чтобы «на порцию» стало разумно (мясо/рыба 200g, жидкости 300ml, гарнир 300g).
-- recipe_ingredients не меняем.

DO $$
DECLARE
  target_meat_fish_g numeric := 200;
  target_liquid_ml numeric := 300;
  target_grains_g numeric := 300;
  max_servings_cap int := 30;
  rows_updated int;
BEGIN
  WITH outlier_required AS (
    SELECT
      ri.recipe_id,
      r.servings_base AS current_servings_base,
      CEIL(
        MAX(
          CASE
            WHEN ri.category IN ('meat', 'fish') AND COALESCE(ri.canonical_unit, 'g') = 'g' AND (ri.canonical_amount::numeric) > 1500
              THEN (ri.canonical_amount::numeric) / target_meat_fish_g
            WHEN ri.category = 'dairy' AND ri.canonical_unit = 'ml' AND (ri.canonical_amount::numeric) > 2500
              THEN (ri.canonical_amount::numeric) / target_liquid_ml
            WHEN ri.category = 'grains' AND (ri.canonical_unit IS NULL OR ri.canonical_unit = 'g') AND (ri.canonical_amount::numeric) > 3000
              THEN (ri.canonical_amount::numeric) / target_grains_g
            ELSE 0
          END
        )
      )::int AS required_raw
    FROM public.recipe_ingredients ri
    JOIN public.recipes r ON r.id = ri.recipe_id
    WHERE ri.canonical_amount IS NOT NULL
    GROUP BY ri.recipe_id, r.servings_base
    HAVING MAX(
      CASE
        WHEN ri.category IN ('meat', 'fish') AND COALESCE(ri.canonical_unit, 'g') = 'g' AND (ri.canonical_amount::numeric) > 1500 THEN 1
        WHEN ri.category = 'dairy' AND ri.canonical_unit = 'ml' AND (ri.canonical_amount::numeric) > 2500 THEN 1
        WHEN ri.category = 'grains' AND (ri.canonical_unit IS NULL OR ri.canonical_unit = 'g') AND (ri.canonical_amount::numeric) > 3000 THEN 1
        ELSE 0
      END
    ) = 1
  ),
  capped AS (
    SELECT
      recipe_id,
      current_servings_base,
      LEAST(GREATEST(required_raw, 1), max_servings_cap) AS required_servings_base
    FROM outlier_required
    WHERE required_raw > current_servings_base
  )
  UPDATE public.recipes r
  SET servings_base = c.required_servings_base
  FROM capped c
  WHERE r.id = c.recipe_id
    AND c.required_servings_base > r.servings_base;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE 'fix_recipe_servings_base_outliers: updated % recipe(s).', rows_updated;
END $$;
