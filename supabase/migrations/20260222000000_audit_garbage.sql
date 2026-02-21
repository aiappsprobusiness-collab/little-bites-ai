-- Audit only: no DELETE/UPDATE/INSERT. Creates schema audit and views for garbage/broken rows reporting.
-- Run: after migration, use SELECT * FROM audit.<view_name> in SQL Editor.

CREATE SCHEMA IF NOT EXISTS audit;

-- ========== A) Broken meal_plans_v2: meals has keys but after normalization no valid recipe_id ==========
-- Valid = non-empty UUID and exists in public.recipes. recipe_id can be in key recipe_id, recipeId, or id.

CREATE OR REPLACE VIEW audit.meal_plans_broken_meals AS
WITH slot_checks AS (
  SELECT
    mp.id,
    mp.user_id,
    mp.member_id,
    mp.planned_date,
    mp.meals,
    t.key AS meal_key,
    COALESCE(v->>'recipe_id', v->>'recipeId', v->>'id') AS raw_recipe_id,
    (COALESCE(v->>'recipe_id', v->>'recipeId', v->>'id')) ~ '^[0-9a-fA-F-]{36}$' AS is_valid_uuid,
    ((COALESCE(v->>'recipe_id', v->>'recipeId', v->>'id')) ~ '^[0-9a-fA-F-]{36}$'
     AND EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = (COALESCE(v->>'recipe_id', v->>'recipeId', v->>'id'))::uuid
    )) AS exists_in_recipes
  FROM public.meal_plans_v2 mp,
       jsonb_each(mp.meals) AS t(key, v)
  WHERE mp.meals IS NOT NULL
    AND mp.meals != '{}'::jsonb
    AND jsonb_typeof(mp.meals) = 'object'
),
per_plan AS (
  SELECT
    id,
    user_id,
    member_id,
    planned_date,
    meals,
    count(*) AS total_slots,
    count(*) FILTER (WHERE is_valid_uuid AND exists_in_recipes) AS valid_slots
  FROM slot_checks
  GROUP BY id, user_id, member_id, planned_date, meals
)
SELECT
  p.id,
  p.user_id,
  p.member_id,
  p.planned_date,
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p.meals) AS k) AS meals_keys,
  p.total_slots,
  p.valid_slots
FROM per_plan p
WHERE p.total_slots > 0 AND p.valid_slots = 0;

COMMENT ON VIEW audit.meal_plans_broken_meals IS 'Rows where meals has keys but no slot has valid recipe_id (uuid + exists in recipes).';

-- Per-slot detail for broken plans only (same criteria)
CREATE OR REPLACE VIEW audit.meal_plans_broken_meals_slots AS
WITH broken_ids AS (
  SELECT id FROM audit.meal_plans_broken_meals
),
slot_checks AS (
  SELECT
    mp.id,
    t.key AS meal_key,
    COALESCE(v->>'recipe_id', v->>'recipeId', v->>'id') AS raw_recipe_id,
    (COALESCE(v->>'recipe_id', v->>'recipeId', v->>'id')) ~ '^[0-9a-fA-F-]{36}$' AS is_valid_uuid,
    ((COALESCE(v->>'recipe_id', v->>'recipeId', v->>'id')) ~ '^[0-9a-fA-F-]{36}$'
     AND EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = (COALESCE(v->>'recipe_id', v->>'recipeId', v->>'id'))::uuid
    )) AS exists_in_recipes
  FROM public.meal_plans_v2 mp,
       jsonb_each(mp.meals) AS t(key, v)
  WHERE mp.id IN (SELECT id FROM broken_ids)
)
SELECT * FROM slot_checks ORDER BY id, meal_key;

-- ========== B) Garbage recipes (source IN ('chat_ai','week_ai') only) ==========

-- B1) Recipes with no ingredients
CREATE OR REPLACE VIEW audit.recipes_no_ingredients AS
SELECT
  r.id AS recipe_id,
  r.title,
  r.source,
  r.created_at,
  0 AS ingredients_count
FROM public.recipes r
WHERE r.source IN ('chat_ai', 'week_ai')
  AND NOT EXISTS (SELECT 1 FROM public.recipe_ingredients ri WHERE ri.recipe_id = r.id);

-- B2) Recipes with steps < 2
CREATE OR REPLACE VIEW audit.recipes_low_steps AS
SELECT
  r.id AS recipe_id,
  r.title,
  r.source,
  r.created_at,
  count(rs.id)::int AS steps_count
FROM public.recipes r
LEFT JOIN public.recipe_steps rs ON rs.recipe_id = r.id
WHERE r.source IN ('chat_ai', 'week_ai')
GROUP BY r.id, r.title, r.source, r.created_at
HAVING count(rs.id) < 2;

-- B3) Recipes with no chef_advice AND no advice
CREATE OR REPLACE VIEW audit.recipes_no_advice AS
SELECT
  r.id AS recipe_id,
  r.title,
  r.source,
  r.created_at,
  r.chef_advice,
  r.advice
FROM public.recipes r
WHERE r.source IN ('chat_ai', 'week_ai')
  AND NULLIF(trim(COALESCE(r.chef_advice, '')), '') IS NULL
  AND NULLIF(trim(COALESCE(r.advice, '')), '') IS NULL;

-- B4) Recipes with many ingredients that have display_text but (amount is null or unit is null)
CREATE OR REPLACE VIEW audit.recipes_bad_ingredients_display_only AS
SELECT
  r.id AS recipe_id,
  r.title,
  r.source,
  r.created_at,
  count(ri.id)::int AS bad_rows_count
FROM public.recipes r
JOIN public.recipe_ingredients ri ON ri.recipe_id = r.id
WHERE r.source IN ('chat_ai', 'week_ai')
  AND ri.display_text IS NOT NULL AND trim(COALESCE(ri.display_text, '')) <> ''
  AND (ri.amount IS NULL OR ri.unit IS NULL)
GROUP BY r.id, r.title, r.source, r.created_at
HAVING count(ri.id) > 0;

-- Garbage score: (no_ingredients?1:0) + (steps_lt_2?1:0) + (no_advices?1:0). Top 200 by score desc, created_at desc.
CREATE OR REPLACE VIEW audit.recipes_garbage_top200 AS
WITH stats AS (
  SELECT
    r.id AS recipe_id,
    r.title,
    r.source,
    r.created_at,
    (SELECT count(*) FROM public.recipe_ingredients ri WHERE ri.recipe_id = r.id) AS ingredients_count,
    (SELECT count(*) FROM public.recipe_steps rs WHERE rs.recipe_id = r.id) AS steps_count,
    (NULLIF(trim(COALESCE(r.chef_advice, '')), '') IS NOT NULL OR NULLIF(trim(COALESCE(r.advice, '')), '') IS NOT NULL) AS has_any_advice
  FROM public.recipes r
  WHERE r.source IN ('chat_ai', 'week_ai')
),
scored AS (
  SELECT
    recipe_id,
    title,
    source,
    created_at,
    ingredients_count,
    steps_count,
    (CASE WHEN ingredients_count = 0 THEN 1 ELSE 0 END
     + CASE WHEN steps_count < 2 THEN 1 ELSE 0 END
     + CASE WHEN NOT has_any_advice THEN 1 ELSE 0 END) AS garbage_score
  FROM stats
)
SELECT * FROM scored
ORDER BY garbage_score DESC, created_at DESC
LIMIT 200;

COMMENT ON VIEW audit.recipes_garbage_top200 IS 'Top 200 AI recipes by garbage_score (no_ingredients + steps_lt_2 + no_advice). Audit only.';
