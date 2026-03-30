-- =============================================================================
-- Dashboard: Signup cohorts по неделе первого auth_success
-- =============================================================================
-- Эквивалент cohort_activation_by_signup_week.sql с понятными именами колонок для BI.
-- Параметры: cohort_from, cohort_to (date), data_through_ts (timestamptz).
-- =============================================================================

WITH params AS (
  SELECT
    '2026-01-01'::date AS cohort_from,
    '2026-04-01'::date AS cohort_to,
    '2026-04-15'::timestamptz AS data_through_ts
),
first_auth AS (
  SELECT DISTINCT ON (ue.user_id)
    ue.user_id,
    ue.event_timestamp AS first_auth_at,
    (ue.event_timestamp AT TIME ZONE 'UTC')::date AS first_auth_date
  FROM analytics.usage_events_enriched ue
  WHERE ue.feature_raw = 'auth_success' AND ue.user_id IS NOT NULL
  ORDER BY ue.user_id, ue.event_timestamp ASC
),
cohort AS (
  SELECT
    fa.user_id,
    fa.first_auth_at,
    date_trunc('week', fa.first_auth_date)::date AS signup_week
  FROM first_auth fa
  CROSS JOIN params p
  WHERE fa.first_auth_date >= p.cohort_from AND fa.first_auth_date < p.cohort_to
),
activation AS (
  SELECT c.user_id, c.signup_week, MIN(ue.event_timestamp) AS first_activation_at
  FROM cohort c
  INNER JOIN analytics.usage_events_enriched ue ON ue.user_id = c.user_id
  CROSS JOIN params p
  WHERE ue.feature_raw IN (
      'chat_recipe', 'plan_fill_day', 'favorite_add', 'plan_slot_replace_success',
      'plan_fill_day_success', 'help', 'recipe_view'
    )
    AND ue.event_timestamp >= c.first_auth_at
    AND ue.event_timestamp <= p.data_through_ts
  GROUP BY c.user_id, c.signup_week
),
paywall AS (
  SELECT DISTINCT c.user_id
  FROM cohort c
  INNER JOIN analytics.usage_events_enriched ue ON ue.user_id = c.user_id
  CROSS JOIN params p
  WHERE ue.feature_raw = 'paywall_view'
    AND ue.event_timestamp >= c.first_auth_at
    AND ue.event_timestamp <= p.data_through_ts
),
purchase AS (
  SELECT DISTINCT c.user_id
  FROM cohort c
  INNER JOIN public.subscription_plan_audit spa ON spa.user_id = c.user_id
  CROSS JOIN params p
  WHERE spa.created_at <= p.data_through_ts
),
cohort_stats AS (
  SELECT
    c.signup_week,
    COUNT(*) AS cohort_size_users,
    COUNT(a.user_id) AS activated_users,
    ROUND(100.0 * COUNT(a.user_id) / NULLIF(COUNT(*), 0), 2) AS activation_rate_pct,
    COUNT(*) FILTER (WHERE pw.user_id IS NOT NULL) AS users_paywall_reach,
    ROUND(100.0 * COUNT(*) FILTER (WHERE pw.user_id IS NOT NULL) / NULLIF(COUNT(*), 0), 2)
      AS paywall_reach_pct,
    COUNT(*) FILTER (WHERE pu.user_id IS NOT NULL) AS users_purchase_reach,
    ROUND(100.0 * COUNT(*) FILTER (WHERE pu.user_id IS NOT NULL) / NULLIF(COUNT(*), 0), 2)
      AS purchase_reach_pct
  FROM cohort c
  LEFT JOIN activation a ON a.user_id = c.user_id
  LEFT JOIN paywall pw ON pw.user_id = c.user_id
  LEFT JOIN purchase pu ON pu.user_id = c.user_id
  GROUP BY c.signup_week
),
tta AS (
  SELECT a.signup_week, EXTRACT(EPOCH FROM (a.first_activation_at - c.first_auth_at)) AS sec
  FROM activation a
  INNER JOIN cohort c ON c.user_id = a.user_id
)
SELECT
  cs.signup_week,
  cs.cohort_size_users,
  cs.activated_users,
  cs.activation_rate_pct,
  ROUND((SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.sec)
         FROM tta t WHERE t.signup_week = cs.signup_week)::numeric, 0) AS median_sec_to_activation,
  cs.users_paywall_reach,
  cs.paywall_reach_pct,
  cs.users_purchase_reach,
  cs.purchase_reach_pct
FROM cohort_stats cs
ORDER BY cs.signup_week;
