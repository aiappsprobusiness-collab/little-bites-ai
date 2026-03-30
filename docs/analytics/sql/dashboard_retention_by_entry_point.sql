-- =============================================================================
-- Dashboard: Retention D1/D7/D30 по entry bucket (первый pre-auth touch)
-- =============================================================================
-- Классификация как cohort_by_entry_point.sql (landing / shared_plan / shared_recipe / prelogin / other_unknown).
-- Retention activity — набор meaningful из retention_d1_d7_d30.sql.
-- Параметры: cohort_from, cohort_to, data_through (UTC date)
-- =============================================================================

WITH params AS (
  SELECT
    '2026-01-01'::date AS cohort_from,
    '2026-03-01'::date AS cohort_to,
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
    (ue.event_timestamp AT TIME ZONE 'UTC')::date AS cohort_date,
    ue.anon_id AS anon_at_first_auth
  FROM analytics.usage_events_enriched ue
  WHERE ue.feature_raw = 'auth_success' AND ue.user_id IS NOT NULL
  ORDER BY ue.user_id, ue.event_timestamp ASC
),
cohort_users AS (
  SELECT fa.*
  FROM first_auth fa
  CROSS JOIN params p
  WHERE fa.cohort_date >= p.cohort_from AND fa.cohort_date < p.cohort_to
),
prior_events AS (
  SELECT c.user_id, e.feature_raw, e.event_timestamp
  FROM cohort_users c
  INNER JOIN analytics.usage_events_enriched e
    ON e.anon_id = c.anon_at_first_auth
    AND c.anon_at_first_auth IS NOT NULL
    AND e.event_timestamp < c.first_auth_at
    AND e.feature_raw IN ('shared_plan_view', 'share_landing_view', 'landing_view', 'prelogin_view')
),
first_prior AS (
  SELECT DISTINCT ON (user_id) user_id, feature_raw
  FROM prior_events
  ORDER BY user_id, event_timestamp ASC
),
bucketed AS (
  SELECT
    c.user_id,
    c.cohort_date,
    CASE fp.feature_raw
      WHEN 'landing_view' THEN 'landing'
      WHEN 'prelogin_view' THEN 'prelogin'
      WHEN 'shared_plan_view' THEN 'shared_plan'
      WHEN 'share_landing_view' THEN 'shared_recipe'
      ELSE 'other_unknown'
    END AS entry_bucket
  FROM cohort_users c
  LEFT JOIN first_prior fp ON fp.user_id = c.user_id
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
    b.user_id,
    b.entry_bucket,
    b.cohort_date,
    (b.cohort_date + 1) <= p.data_through AS eligible_d1,
    (b.cohort_date + 7) <= p.data_through AS eligible_d7,
    (b.cohort_date + 30) <= p.data_through AS eligible_d30,
    EXISTS (SELECT 1 FROM activity_days a WHERE a.user_id = b.user_id AND a.d = b.cohort_date + 1) AS retained_d1,
    EXISTS (SELECT 1 FROM activity_days a WHERE a.user_id = b.user_id AND a.d = b.cohort_date + 7) AS retained_d7,
    EXISTS (SELECT 1 FROM activity_days a WHERE a.user_id = b.user_id AND a.d = b.cohort_date + 30) AS retained_d30
  FROM bucketed b
  CROSS JOIN params p
)
SELECT
  entry_bucket,
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
GROUP BY entry_bucket
ORDER BY cohort_users DESC;
