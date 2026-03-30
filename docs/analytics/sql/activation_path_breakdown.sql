-- =============================================================================
-- Activation: разбивка по первому пути (Stage 4)
-- =============================================================================
-- Для пользователей с first_auth в [cohort_from, cohort_to): первая активация после
-- first_auth_at — по набору funnel_activation + chat_generate_success (клиентский успех чата).
--
-- path_bucket:
--   chat_help     — chat_recipe, chat_generate_success, help
--   plan          — plan_fill_day, plan_fill_day_success, plan_fill_day_click
--   fav_replace   — favorite_add, plan_slot_replace_success
--   recipe_screen — recipe_view (Stage 5)
--   other         — прочее из списка (если появятся новые feature)
--
-- Часть 2: retention D7 (календарный) среди активированных по пути — см. meaningful set
-- в retention_d1_d7_d30.sql; только пользователи с eligible cohort_date + 7 <= data_through.
-- =============================================================================

WITH params AS (
  SELECT
    '2026-01-01'::date AS cohort_from,
    '2026-04-01'::date AS cohort_to,
    '2026-04-15'::date AS data_through
),
first_auth AS (
  SELECT DISTINCT ON (ue.user_id)
    ue.user_id,
    ue.event_timestamp AS first_auth_at,
    (ue.event_timestamp AT TIME ZONE 'UTC')::date AS cohort_date
  FROM analytics.usage_events_enriched ue
  WHERE ue.feature_raw = 'auth_success'
    AND ue.user_id IS NOT NULL
  ORDER BY ue.user_id, ue.event_timestamp ASC
),
cohort AS (
  SELECT fa.*
  FROM first_auth fa
  CROSS JOIN params p
  WHERE fa.cohort_date >= p.cohort_from
    AND fa.cohort_date < p.cohort_to
),
first_activation AS (
  SELECT DISTINCT ON (c.user_id)
    c.user_id,
    c.cohort_date,
    c.first_auth_at,
    ue.feature_raw AS first_activation_feature,
    ue.event_timestamp AS first_activation_at
  FROM cohort c
  INNER JOIN analytics.usage_events_enriched ue ON ue.user_id = c.user_id
  CROSS JOIN params p
  WHERE ue.event_timestamp >= c.first_auth_at
    AND ue.event_date_utc <= p.data_through
    AND ue.feature_raw IN (
      'chat_recipe', 'plan_fill_day', 'favorite_add', 'plan_slot_replace_success',
      'plan_fill_day_success', 'help', 'chat_generate_success', 'plan_fill_day_click', 'recipe_view'
    )
  ORDER BY c.user_id, ue.event_timestamp ASC
),
paths AS (
  SELECT
    user_id,
    cohort_date,
    first_auth_at,
    first_activation_at,
    CASE
      WHEN first_activation_feature IN ('chat_recipe', 'chat_generate_success', 'help') THEN 'chat_help'
      WHEN first_activation_feature IN ('plan_fill_day', 'plan_fill_day_success', 'plan_fill_day_click') THEN 'plan'
      WHEN first_activation_feature IN ('favorite_add', 'plan_slot_replace_success') THEN 'fav_replace'
      WHEN first_activation_feature = 'recipe_view' THEN 'recipe_screen'
      ELSE 'other'
    END AS path_bucket,
    EXTRACT(EPOCH FROM (first_activation_at - first_auth_at)) AS sec_to_activation
  FROM first_activation
)
SELECT
  path_bucket,
  COUNT(*) AS activated_users,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct_of_activated,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sec_to_activation)::numeric, 0) AS median_sec_to_activation
FROM paths
GROUP BY path_bucket
ORDER BY activated_users DESC;

-- Part 2: D7 retention среди активированных по path_bucket (только eligible)
WITH params AS (
  SELECT
    '2026-01-01'::date AS cohort_from,
    '2026-04-01'::date AS cohort_to,
    '2026-04-15'::date AS data_through
),
meaningful_features AS (
  SELECT unnest(ARRAY[
    'chat_recipe', 'plan_fill_day', 'help', 'favorite_add', 'plan_slot_replace_success',
    'plan_fill_day_success', 'chat_generate_success', 'member_create_success',
    'plan_fill_day_click', 'chat_open', 'plan_view_day', 'share_click', 'recipe_view'
  ]::text[]) AS feature_raw
),
first_auth AS (
  SELECT DISTINCT ON (ue.user_id)
    ue.user_id,
    ue.event_timestamp AS first_auth_at,
    (ue.event_timestamp AT TIME ZONE 'UTC')::date AS cohort_date
  FROM analytics.usage_events_enriched ue
  WHERE ue.feature_raw = 'auth_success'
    AND ue.user_id IS NOT NULL
  ORDER BY ue.user_id, ue.event_timestamp ASC
),
cohort AS (
  SELECT fa.*
  FROM first_auth fa
  CROSS JOIN params p
  WHERE fa.cohort_date >= p.cohort_from
    AND fa.cohort_date < p.cohort_to
),
first_activation AS (
  SELECT DISTINCT ON (c.user_id)
    c.user_id,
    c.cohort_date,
    ue.feature_raw AS first_activation_feature
  FROM cohort c
  INNER JOIN analytics.usage_events_enriched ue ON ue.user_id = c.user_id
  CROSS JOIN params p
  WHERE ue.event_timestamp >= c.first_auth_at
    AND ue.event_date_utc <= p.data_through
    AND ue.feature_raw IN (
      'chat_recipe', 'plan_fill_day', 'favorite_add', 'plan_slot_replace_success',
      'plan_fill_day_success', 'help', 'chat_generate_success', 'plan_fill_day_click', 'recipe_view'
    )
  ORDER BY c.user_id, ue.event_timestamp ASC
),
paths AS (
  SELECT
    fa.user_id,
    fa.cohort_date,
    CASE
      WHEN fa.first_activation_feature IN ('chat_recipe', 'chat_generate_success', 'help') THEN 'chat_help'
      WHEN fa.first_activation_feature IN ('plan_fill_day', 'plan_fill_day_success', 'plan_fill_day_click') THEN 'plan'
      WHEN fa.first_activation_feature IN ('favorite_add', 'plan_slot_replace_success') THEN 'fav_replace'
      WHEN fa.first_activation_feature = 'recipe_view' THEN 'recipe_screen'
      ELSE 'other'
    END AS path_bucket
  FROM first_activation fa
),
activity_d7 AS (
  SELECT DISTINCT ue.user_id
  FROM analytics.usage_events_enriched ue
  INNER JOIN meaningful_features mf ON mf.feature_raw = ue.feature_raw
  INNER JOIN paths pth
    ON pth.user_id = ue.user_id
    AND ue.event_date_utc = pth.cohort_date + 7
  CROSS JOIN params p
  WHERE ue.user_id IS NOT NULL
    AND ue.event_date_utc <= p.data_through
)
SELECT
  pth.path_bucket,
  COUNT(*) AS activated_in_cohort_window,
  COUNT(*) FILTER (WHERE (pth.cohort_date + 7) <= pr.data_through) AS eligible_d7,
  COUNT(*) FILTER (
    WHERE (pth.cohort_date + 7) <= pr.data_through
      AND a7.user_id IS NOT NULL
  ) AS retained_d7,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE (pth.cohort_date + 7) <= pr.data_through
        AND a7.user_id IS NOT NULL
    ) / NULLIF(
      COUNT(*) FILTER (WHERE (pth.cohort_date + 7) <= pr.data_through),
      0
    ),
    2
  ) AS retention_d7_pct
FROM paths pth
CROSS JOIN params pr
LEFT JOIN activity_d7 a7 ON a7.user_id = pth.user_id
GROUP BY pth.path_bucket, pr.data_through
ORDER BY activated_in_cohort_window DESC;
