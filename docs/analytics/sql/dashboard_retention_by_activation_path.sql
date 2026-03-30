-- =============================================================================
-- Dashboard: Retention D1/D7/D30 по первому пути активации (path_bucket)
-- =============================================================================
-- path_bucket как activation_path_breakdown.sql; когорта — first_auth в [cohort_from, cohort_to).
-- Учитываются только пользователи с хотя бы одной активацией после first_auth до data_through.
-- Параметры: cohort_from, cohort_to, data_through (UTC date)
-- =============================================================================

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
  WHERE ue.feature_raw = 'auth_success' AND ue.user_id IS NOT NULL
  ORDER BY ue.user_id, ue.event_timestamp ASC
),
cohort AS (
  SELECT fa.*
  FROM first_auth fa
  CROSS JOIN params p
  WHERE fa.cohort_date >= p.cohort_from AND fa.cohort_date < p.cohort_to
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
activity_days AS (
  SELECT DISTINCT ue.user_id, ue.event_date_utc AS d
  FROM analytics.usage_events_enriched ue
  INNER JOIN meaningful_features mf ON mf.feature_raw = ue.feature_raw
  CROSS JOIN params p
  WHERE ue.user_id IS NOT NULL AND ue.event_date_utc <= p.data_through
),
enriched AS (
  SELECT
    pth.user_id,
    pth.path_bucket,
    pth.cohort_date,
    (pth.cohort_date + 1) <= pr.data_through AS eligible_d1,
    (pth.cohort_date + 7) <= pr.data_through AS eligible_d7,
    (pth.cohort_date + 30) <= pr.data_through AS eligible_d30,
    EXISTS (SELECT 1 FROM activity_days a WHERE a.user_id = pth.user_id AND a.d = pth.cohort_date + 1) AS retained_d1,
    EXISTS (SELECT 1 FROM activity_days a WHERE a.user_id = pth.user_id AND a.d = pth.cohort_date + 7) AS retained_d7,
    EXISTS (SELECT 1 FROM activity_days a WHERE a.user_id = pth.user_id AND a.d = pth.cohort_date + 30) AS retained_d30
  FROM paths pth
  CROSS JOIN params pr
)
SELECT
  path_bucket,
  COUNT(*) AS cohort_users_activated,
  SUM(CASE WHEN eligible_d1 THEN 1 ELSE 0 END) AS eligible_d1,
  SUM(CASE WHEN eligible_d1 AND retained_d1 THEN 1 ELSE 0 END) AS retained_d1,
  ROUND(
    100.0 * SUM(CASE WHEN eligible_d1 AND retained_d1 THEN 1 ELSE 0 END)
    / NULLIF(SUM(CASE WHEN eligible_d1 THEN 1 ELSE 0 END), 0),
    2
  ) AS retention_d1_pct,
  SUM(CASE WHEN eligible_d7 THEN 1 ELSE 0 END) AS eligible_d7,
  SUM(CASE WHEN eligible_d7 AND retained_d7 THEN 1 ELSE 0 END) AS retained_d7,
  ROUND(
    100.0 * SUM(CASE WHEN eligible_d7 AND retained_d7 THEN 1 ELSE 0 END)
    / NULLIF(SUM(CASE WHEN eligible_d7 THEN 1 ELSE 0 END), 0),
    2
  ) AS retention_d7_pct,
  SUM(CASE WHEN eligible_d30 THEN 1 ELSE 0 END) AS eligible_d30,
  SUM(CASE WHEN eligible_d30 AND retained_d30 THEN 1 ELSE 0 END) AS retained_d30,
  ROUND(
    100.0 * SUM(CASE WHEN eligible_d30 AND retained_d30 THEN 1 ELSE 0 END)
    / NULLIF(SUM(CASE WHEN eligible_d30 THEN 1 ELSE 0 END), 0),
    2
  ) AS retention_d30_pct
FROM enriched
GROUP BY path_bucket
ORDER BY cohort_users_activated DESC;
