-- Preview only: view of dedupe candidates (no INSERT/DELETE).
-- group_type: duplicate_title | duplicate_fingerprint; only groups with count(*) > 1.

CREATE OR REPLACE VIEW public.recipes_dedupe_candidates_preview AS
WITH plan_ids AS (
  SELECT DISTINCT (v->>'recipe_id')::uuid AS id
  FROM public.meal_plans_v2 mp, jsonb_each(mp.meals) AS t(k, v)
  WHERE v->>'recipe_id' IS NOT NULL AND (v->>'recipe_id')::text ~ '^[0-9a-fA-F-]{36}$'
),
fav_ids AS (
  SELECT recipe_id AS id FROM public.favorites_v2 WHERE recipe_id IS NOT NULL
),
stats AS (
  SELECT
    r.id,
    (SELECT count(*) FROM public.recipe_steps rs WHERE rs.recipe_id = r.id) AS steps_count,
    (SELECT count(*) FROM public.recipe_ingredients ri WHERE ri.recipe_id = r.id) AS ingredients_count
  FROM public.recipes r
),
flags AS (
  SELECT
    id,
    (NULLIF(trim(COALESCE(chef_advice, '')), '') IS NOT NULL) AS has_chef_advice,
    (NULLIF(trim(COALESCE(advice, '')), '') IS NOT NULL) AS has_advice
  FROM public.recipes
),

-- duplicate_title: norm_title, partition by user_id + norm_title
norm_title AS (
  SELECT id, user_id, lower(trim(regexp_replace(COALESCE(title, ''), '\s+', ' ', 'g'))) AS norm_title
  FROM public.recipes
),
title_ranked AS (
  SELECT
    nt.user_id,
    nt.norm_title AS group_key,
    r.id AS recipe_id,
    r.title,
    r.source,
    r.created_at,
    COALESCE(s.steps_count, 0) AS steps_count,
    COALESCE(s.ingredients_count, 0) AS ingredients_count,
    COALESCE(f.has_chef_advice, false) AS has_chef_advice,
    COALESCE(f.has_advice, false) AS has_advice,
    (r.id IN (SELECT id FROM plan_ids)) AS is_used_in_plan,
    (r.id IN (SELECT id FROM fav_ids)) AS is_favorited,
    ROW_NUMBER() OVER (
      PARTITION BY nt.user_id, nt.norm_title
      ORDER BY
        (r.id IN (SELECT id FROM plan_ids)) DESC,
        (r.id IN (SELECT id FROM fav_ids)) DESC,
        COALESCE(f.has_chef_advice, false) DESC,
        COALESCE(f.has_advice, false) DESC,
        COALESCE(s.steps_count, 0) DESC,
        COALESCE(s.ingredients_count, 0) DESC,
        r.created_at DESC NULLS LAST
    ) AS winner_rank,
    count(*) OVER (PARTITION BY nt.user_id, nt.norm_title) AS grp_cnt
  FROM public.recipes r
  JOIN norm_title nt ON nt.id = r.id
  LEFT JOIN stats s ON s.id = r.id
  LEFT JOIN flags f ON f.id = r.id
  WHERE nt.norm_title <> ''
),

-- duplicate_fingerprint: ingredient fingerprint per recipe
ing_lines AS (
  SELECT
    recipe_id,
    lower(trim(regexp_replace(
      COALESCE(
        NULLIF(trim(COALESCE(display_text, '')), ''),
        trim(COALESCE(name, '')) || ' ' || COALESCE(canonical_amount::text, '') || ' ' || COALESCE(canonical_unit, '')
      ),
      '\s+', ' ', 'g'
    ))) AS line
  FROM public.recipe_ingredients
),
fp_per_recipe AS (
  SELECT recipe_id, md5(COALESCE(string_agg(line, '|' ORDER BY line), '')) AS fingerprint
  FROM ing_lines
  GROUP BY recipe_id
),
fp_ranked AS (
  SELECT
    r.user_id,
    fp.fingerprint AS group_key,
    r.id AS recipe_id,
    r.title,
    r.source,
    r.created_at,
    COALESCE(s.steps_count, 0) AS steps_count,
    COALESCE(s.ingredients_count, 0) AS ingredients_count,
    COALESCE(f.has_chef_advice, false) AS has_chef_advice,
    COALESCE(f.has_advice, false) AS has_advice,
    (r.id IN (SELECT id FROM plan_ids)) AS is_used_in_plan,
    (r.id IN (SELECT id FROM fav_ids)) AS is_favorited,
    ROW_NUMBER() OVER (
      PARTITION BY r.user_id, fp.fingerprint
      ORDER BY
        (r.id IN (SELECT id FROM plan_ids)) DESC,
        (r.id IN (SELECT id FROM fav_ids)) DESC,
        COALESCE(f.has_chef_advice, false) DESC,
        COALESCE(f.has_advice, false) DESC,
        COALESCE(s.steps_count, 0) DESC,
        COALESCE(s.ingredients_count, 0) DESC,
        r.created_at DESC NULLS LAST
    ) AS winner_rank,
    count(*) OVER (PARTITION BY r.user_id, fp.fingerprint) AS grp_cnt
  FROM public.recipes r
  JOIN fp_per_recipe fp ON fp.recipe_id = r.id
  LEFT JOIN stats s ON s.id = r.id
  LEFT JOIN flags f ON f.id = r.id
),

title_rows AS (
  SELECT
    user_id,
    'duplicate_title'::text AS group_type,
    group_key,
    recipe_id,
    title,
    source,
    created_at,
    steps_count,
    ingredients_count,
    has_chef_advice,
    has_advice,
    is_used_in_plan,
    is_favorited,
    winner_rank,
    (winner_rank = 1) AS is_winner,
    (winner_rank > 1 AND NOT is_used_in_plan AND NOT is_favorited) AS will_delete
  FROM title_ranked
  WHERE grp_cnt > 1
),

fp_rows AS (
  SELECT
    user_id,
    'duplicate_fingerprint'::text AS group_type,
    group_key,
    recipe_id,
    title,
    source,
    created_at,
    steps_count,
    ingredients_count,
    has_chef_advice,
    has_advice,
    is_used_in_plan,
    is_favorited,
    winner_rank,
    (winner_rank = 1) AS is_winner,
    (winner_rank > 1 AND NOT is_used_in_plan AND NOT is_favorited) AS will_delete
  FROM fp_ranked
  WHERE grp_cnt > 1
)

SELECT * FROM title_rows
UNION ALL
SELECT * FROM fp_rows;

COMMENT ON VIEW public.recipes_dedupe_candidates_preview IS 'Dedupe candidates only (preview). No delete. group_type: duplicate_title | duplicate_fingerprint; will_delete=true means would be removed if dedupe runs (not in plan/fav, not winner).';
