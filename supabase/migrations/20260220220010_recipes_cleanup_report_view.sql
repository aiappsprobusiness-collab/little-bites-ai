-- View for quality report after cleanup: steps_count, ingredients_count, advice flags,
-- bad_ingredients_count, is_used_in_plan, is_favorited, computed delete_reason.

CREATE OR REPLACE VIEW public.recipes_quality_report AS
WITH plan_recipe_ids AS (
  SELECT DISTINCT (v->>'recipe_id')::uuid AS recipe_id
  FROM public.meal_plans_v2 mp,
       jsonb_each(mp.meals) AS t(k, v)
  WHERE v->>'recipe_id' IS NOT NULL
    AND (v->>'recipe_id')::text ~ '^[0-9a-fA-F-]{36}$'
),
fav_recipe_ids AS (
  SELECT recipe_id FROM public.favorites_v2 WHERE recipe_id IS NOT NULL
),
step_counts AS (
  SELECT recipe_id, count(*) AS steps_count
  FROM public.recipe_steps
  GROUP BY recipe_id
),
ing_counts AS (
  SELECT
    recipe_id,
    count(*) AS ingredients_count,
    count(*) FILTER (
      WHERE (canonical_amount IS NULL OR canonical_unit IS NULL)
        AND (display_text IS NULL OR trim(COALESCE(display_text, '')) = '')
    ) AS bad_ingredients_count
  FROM public.recipe_ingredients
  GROUP BY recipe_id
)
SELECT
  r.id AS recipe_id,
  r.source,
  r.title,
  COALESCE(sc.steps_count, 0)::int AS steps_count,
  COALESCE(ic.ingredients_count, 0)::int AS ingredients_count,
  (NULLIF(trim(COALESCE(r.chef_advice, '')), '') IS NOT NULL) AS has_chef_advice,
  (NULLIF(trim(COALESCE(r.advice, '')), '') IS NOT NULL) AS has_advice,
  COALESCE(ic.bad_ingredients_count, 0)::int AS bad_ingredients_count,
  (r.id IN (SELECT recipe_id FROM plan_recipe_ids)) AS is_used_in_plan,
  (r.id IN (SELECT recipe_id FROM fav_recipe_ids)) AS is_favorited,
  CASE
    WHEN r.id IN (SELECT recipe_id FROM plan_recipe_ids) OR r.id IN (SELECT recipe_id FROM fav_recipe_ids) THEN NULL
    WHEN NULLIF(trim(COALESCE(r.chef_advice, '')), '') IS NULL AND NULLIF(trim(COALESCE(r.advice, '')), '') IS NULL THEN 'no_advice'
    WHEN COALESCE(sc.steps_count, 0) < 2 THEN 'low_steps'
    WHEN COALESCE(ic.ingredients_count, 0) < 3 THEN 'low_ingredients'
    WHEN COALESCE(ic.bad_ingredients_count, 0) >= 2 THEN 'bad_canonical'
    WHEN NULLIF(trim(COALESCE(r.title, '')), '') IS NULL
         OR sc.recipe_id IS NULL OR ic.recipe_id IS NULL THEN 'missing_title'
    ELSE NULL
  END AS delete_reason
FROM public.recipes r
LEFT JOIN step_counts sc ON sc.recipe_id = r.id
LEFT JOIN ing_counts ic ON ic.recipe_id = r.id;

COMMENT ON VIEW public.recipes_quality_report IS 'Quality metrics and computed delete_reason for recipes; used_in_plan/favorited exclude from cleanup.';
