-- =============================================================================
-- Dashboard: Cohort heatmap — неделя первого auth (строки = signup_week)
-- =============================================================================
-- Одна строка на ISO-неделю; колонки D1/D7/D30 согласованы с retention_d1_d7_d30.sql.
-- В Metabase heatmap: pivot по signup_week × metric или раскрасить столбцы pct.
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
  SELECT
    ue.user_id,
    MIN(ue.event_timestamp) AS first_auth_at,
    (MIN(ue.event_timestamp) AT TIME ZONE 'UTC')::date AS cohort_date
  FROM analytics.usage_events_enriched ue
  WHERE ue.feature_raw = 'auth_success' AND ue.user_id IS NOT NULL
  GROUP BY ue.user_id
),
cohort_users AS (
  SELECT
    fa.user_id,
    date_trunc('week', fa.cohort_date)::date AS signup_week,
    fa.cohort_date,
    fa.first_auth_at
  FROM first_auth fa
  CROSS JOIN params p
  WHERE fa.cohort_date >= p.cohort_from AND fa.cohort_date < p.cohort_to
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
    c.signup_week,
    c.user_id,
    c.cohort_date,
    (c.cohort_date + 1) <= p.data_through AS eligible_d1,
    (c.cohort_date + 7) <= p.data_through AS eligible_d7,
    (c.cohort_date + 30) <= p.data_through AS eligible_d30,
    EXISTS (SELECT 1 FROM activity_days a WHERE a.user_id = c.user_id AND a.d = c.cohort_date + 1) AS retained_d1,
    EXISTS (SELECT 1 FROM activity_days a WHERE a.user_id = c.user_id AND a.d = c.cohort_date + 7) AS retained_d7,
    EXISTS (SELECT 1 FROM activity_days a WHERE a.user_id = c.user_id AND a.d = c.cohort_date + 30) AS retained_d30
  FROM cohort_users c
  CROSS JOIN params p
)
SELECT
  signup_week,
  COUNT(*) AS cohort_users,
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
GROUP BY signup_week
ORDER BY signup_week;
