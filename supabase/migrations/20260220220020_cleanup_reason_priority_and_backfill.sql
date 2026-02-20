-- Fix delete_reason priority: most "garbage" reasons first, no_advice last.
-- 1) Backfill recipes_trash.delete_reason from trash tables (same priority).
-- 2) Update recipes_quality_report view to use same priority.
-- Does NOT touch deleted_at.

-- Priority order (first match wins): missing_title -> no_links -> low_ingredients -> low_steps -> bad_canonical -> no_advice.

-- ========== 1. Backfill recipes_trash.delete_reason ==========
WITH trash_steps AS (
  SELECT recipe_id, count(*) AS steps_count
  FROM public.recipe_steps_trash
  GROUP BY recipe_id
),
trash_ings AS (
  SELECT
    recipe_id,
    count(*) AS ingredients_count,
    count(*) FILTER (
      WHERE (canonical_amount IS NULL OR canonical_unit IS NULL)
        AND (display_text IS NULL OR trim(COALESCE(display_text, '')) = '')
    ) AS bad_ingredients_count
  FROM public.recipe_ingredients_trash
  GROUP BY recipe_id
),
computed_reason AS (
  SELECT
    rt.id,
    CASE
      WHEN NULLIF(trim(COALESCE(rt.title, '')), '') IS NULL THEN 'missing_title'
      WHEN ts.recipe_id IS NULL OR ti.recipe_id IS NULL THEN 'no_links'
      WHEN COALESCE(ti.ingredients_count, 0) < 3 THEN 'low_ingredients'
      WHEN COALESCE(ts.steps_count, 0) < 2 THEN 'low_steps'
      WHEN COALESCE(ti.bad_ingredients_count, 0) >= 2 THEN 'bad_canonical'
      WHEN NULLIF(trim(COALESCE(rt.chef_advice, '')), '') IS NULL AND NULLIF(trim(COALESCE(rt.advice, '')), '') IS NULL THEN 'no_advice'
      ELSE 'no_links'
    END AS new_reason
  FROM public.recipes_trash rt
  LEFT JOIN trash_steps ts ON ts.recipe_id = rt.id
  LEFT JOIN trash_ings ti ON ti.recipe_id = rt.id
)
UPDATE public.recipes_trash rt
SET delete_reason = cr.new_reason
FROM computed_reason cr
WHERE rt.id = cr.id;

-- ========== 2. Update view: same priority for delete_reason ==========
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
    WHEN NULLIF(trim(COALESCE(r.title, '')), '') IS NULL THEN 'missing_title'
    WHEN sc.recipe_id IS NULL OR ic.recipe_id IS NULL THEN 'no_links'
    WHEN COALESCE(ic.ingredients_count, 0) < 3 THEN 'low_ingredients'
    WHEN COALESCE(sc.steps_count, 0) < 2 THEN 'low_steps'
    WHEN COALESCE(ic.bad_ingredients_count, 0) >= 2 THEN 'bad_canonical'
    WHEN NULLIF(trim(COALESCE(r.chef_advice, '')), '') IS NULL AND NULLIF(trim(COALESCE(r.advice, '')), '') IS NULL THEN 'no_advice'
    ELSE NULL
  END AS delete_reason
FROM public.recipes r
LEFT JOIN step_counts sc ON sc.recipe_id = r.id
LEFT JOIN ing_counts ic ON ic.recipe_id = r.id;

COMMENT ON VIEW public.recipes_quality_report IS 'Quality metrics and computed delete_reason (priority: missing_title, no_links, low_ingredients, low_steps, bad_canonical, no_advice).';
