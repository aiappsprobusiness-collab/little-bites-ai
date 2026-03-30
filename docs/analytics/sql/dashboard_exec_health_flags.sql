-- =============================================================================
-- Dashboard: Executive — health flags (текущий день vs скользящее среднее)
-- =============================================================================
-- Параметры:
--   :as_of_date — UTC-день «сегодня» для current_value, например '2026-03-30'
--   :trailing_days — число предыдущих дней для среднего (исключая as_of_date), например 7
--
-- Выход: metric | current_value | trailing_avg | delta_pct_vs_trailing_avg
--
-- Согласовано с dashboard_exec_trends_daily.sql (те же наборы событий).
-- =============================================================================

WITH params AS (
  SELECT
    '2026-03-30'::date AS as_of_date,
    7 AS trailing_days
),
bounds AS (
  SELECT
    p.as_of_date AS d_current,
    p.as_of_date - p.trailing_days AS d_trail_start,
    p.as_of_date - 1 AS d_trail_end
  FROM params p
),
active_features AS (
  SELECT unnest(ARRAY[
    'chat_recipe', 'plan_fill_day', 'help', 'favorite_add', 'plan_slot_replace_success',
    'plan_fill_day_success', 'chat_generate_success', 'member_create_success',
    'plan_fill_day_click', 'chat_open', 'plan_view_day', 'share_click', 'recipe_view'
  ]::text[]) AS feature_raw
),
activation_features AS (
  SELECT unnest(ARRAY[
    'chat_recipe', 'plan_fill_day', 'favorite_add', 'plan_slot_replace_success',
    'plan_fill_day_success', 'help', 'recipe_view'
  ]::text[]) AS feature_raw
),
active_by_day AS (
  SELECT ue.event_date_utc AS d, COUNT(DISTINCT ue.user_id) AS v
  FROM analytics.usage_events_enriched ue
  INNER JOIN active_features af ON af.feature_raw = ue.feature_raw
  WHERE ue.user_id IS NOT NULL
  GROUP BY ue.event_date_utc
),
auth_by_day AS (
  SELECT ue.event_date_utc AS d, COUNT(DISTINCT ue.user_id) AS v
  FROM analytics.usage_events_enriched ue
  WHERE ue.feature_raw = 'auth_success' AND ue.user_id IS NOT NULL
  GROUP BY ue.event_date_utc
),
activated_by_day AS (
  SELECT ue.event_date_utc AS d, COUNT(DISTINCT ue.user_id) AS v
  FROM analytics.usage_events_enriched ue
  INNER JOIN activation_features af ON af.feature_raw = ue.feature_raw
  WHERE ue.user_id IS NOT NULL
  GROUP BY ue.event_date_utc
),
share_views_by_day AS (
  SELECT ue.event_date_utc AS d, COUNT(*)::bigint AS v
  FROM analytics.usage_events_enriched ue
  WHERE ue.feature_raw = 'shared_plan_view'
  GROUP BY ue.event_date_utc
),
recipe_views_by_day AS (
  SELECT ue.event_date_utc AS d, COUNT(*)::bigint AS v
  FROM analytics.usage_events_enriched ue
  WHERE ue.feature_raw = 'recipe_view'
  GROUP BY ue.event_date_utc
),
purchase_by_day AS (
  SELECT (spa.created_at AT TIME ZONE 'UTC')::date AS d, COUNT(DISTINCT spa.user_id)::bigint AS v
  FROM public.subscription_plan_audit spa
  GROUP BY 1
),
all_days AS (
  SELECT d FROM active_by_day
  UNION SELECT d FROM auth_by_day
  UNION SELECT d FROM activated_by_day
  UNION SELECT d FROM share_views_by_day
  UNION SELECT d FROM recipe_views_by_day
  UNION SELECT d FROM purchase_by_day
),
merged AS (
  SELECT
    ad.d,
    COALESCE(a.v, 0) AS active_users,
    COALESCE(au.v, 0) AS auth_users,
    COALESCE(ac.v, 0) AS activated_users,
    COALESCE(s.v, 0) AS shared_plan_views,
    COALESCE(r.v, 0) AS recipe_views,
    COALESCE(p.v, 0) AS purchase_users
  FROM all_days ad
  LEFT JOIN active_by_day a ON a.d = ad.d
  LEFT JOIN auth_by_day au ON au.d = ad.d
  LEFT JOIN activated_by_day ac ON ac.d = ad.d
  LEFT JOIN share_views_by_day s ON s.d = ad.d
  LEFT JOIN recipe_views_by_day r ON r.d = ad.d
  LEFT JOIN purchase_by_day p ON p.d = ad.d
),
curr AS (
  SELECT m.*
  FROM merged m
  CROSS JOIN bounds b
  WHERE m.d = b.d_current
),
trail AS (
  SELECT
    AVG(m.active_users) AS avg_active_users,
    AVG(m.auth_users) AS avg_auth_users,
    AVG(m.activated_users) AS avg_activated_users,
    AVG(m.shared_plan_views) AS avg_shared_plan_views,
    AVG(m.recipe_views) AS avg_recipe_views,
    AVG(m.purchase_users) AS avg_purchase_users
  FROM merged m
  CROSS JOIN bounds b
  WHERE m.d >= b.d_trail_start AND m.d <= b.d_trail_end
)
SELECT * FROM (
  SELECT
    'active_users (DAU definition)'::text AS metric,
    (SELECT active_users FROM curr)::numeric AS current_value,
    (SELECT avg_active_users FROM trail) AS trailing_avg,
    ROUND(
      100.0 * ((SELECT active_users FROM curr) - (SELECT avg_active_users FROM trail))
      / NULLIF((SELECT avg_active_users FROM trail), 0),
      2
    ) AS delta_pct_vs_trailing_avg
  UNION ALL
  SELECT
    'auth_success_users',
    (SELECT auth_users FROM curr)::numeric,
    (SELECT avg_auth_users FROM trail),
    ROUND(
      100.0 * ((SELECT auth_users FROM curr) - (SELECT avg_auth_users FROM trail))
      / NULLIF((SELECT avg_auth_users FROM trail), 0),
      2
    )
  UNION ALL
  SELECT
    'activated_users (funnel_activation set)',
    (SELECT activated_users FROM curr)::numeric,
    (SELECT avg_activated_users FROM trail),
    ROUND(
      100.0 * ((SELECT activated_users FROM curr) - (SELECT avg_activated_users FROM trail))
      / NULLIF((SELECT avg_activated_users FROM trail), 0),
      2
    )
  UNION ALL
  SELECT
    'purchase_users_billing',
    (SELECT purchase_users FROM curr)::numeric,
    (SELECT avg_purchase_users FROM trail),
    ROUND(
      100.0 * ((SELECT purchase_users FROM curr) - (SELECT avg_purchase_users FROM trail))
      / NULLIF((SELECT avg_purchase_users FROM trail), 0),
      2
    )
  UNION ALL
  SELECT
    'shared_plan_views (events)',
    (SELECT shared_plan_views FROM curr)::numeric,
    (SELECT avg_shared_plan_views FROM trail),
    ROUND(
      100.0 * ((SELECT shared_plan_views FROM curr) - (SELECT avg_shared_plan_views FROM trail))
      / NULLIF((SELECT avg_shared_plan_views FROM trail), 0),
      2
    )
  UNION ALL
  SELECT
    'recipe_views (events)',
    (SELECT recipe_views FROM curr)::numeric,
    (SELECT avg_recipe_views FROM trail),
    ROUND(
      100.0 * ((SELECT recipe_views FROM curr) - (SELECT avg_recipe_views FROM trail))
      / NULLIF((SELECT avg_recipe_views FROM trail), 0),
      2
    )
) x
ORDER BY metric;
