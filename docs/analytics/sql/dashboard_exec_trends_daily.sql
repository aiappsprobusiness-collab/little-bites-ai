-- =============================================================================
-- Dashboard: Executive — дневные тренды (последние N UTC-дней)
-- =============================================================================
-- Параметры:
--   :last_n_days — число дней (включая конечную дату), например 28
--   :through_date — последний день окна в UTC, например '2026-03-30'
--
-- Метрики по event_date_utc:
--   active_users — как DAU (meaningful / active use, только user_id)
--   auth_users — DISTINCT user_id с auth_success
--   activated_users — DISTINCT user_id с событием активации (набор funnel_activation)
--   purchase_users — DISTINCT user_id с subscription_plan_audit (по дате created_at UTC)
--   shared_plan_views — COUNT(*) shared_plan_view
--   recipe_views — COUNT(*) recipe_view
-- =============================================================================

WITH params AS (
  SELECT
    28 AS last_n_days,
    '2026-03-30'::date AS through_date
),
days AS (
  SELECT
    generate_series(
      p.through_date - (p.last_n_days - 1),
      p.through_date,
      '1 day'::interval
    )::date AS d
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
  SELECT ue.event_date_utc AS d, COUNT(DISTINCT ue.user_id) AS active_users
  FROM analytics.usage_events_enriched ue
  INNER JOIN active_features af ON af.feature_raw = ue.feature_raw
  INNER JOIN days dd ON dd.d = ue.event_date_utc
  WHERE ue.user_id IS NOT NULL
  GROUP BY ue.event_date_utc
),
auth_by_day AS (
  SELECT ue.event_date_utc AS d, COUNT(DISTINCT ue.user_id) AS auth_users
  FROM analytics.usage_events_enriched ue
  INNER JOIN days dd ON dd.d = ue.event_date_utc
  WHERE ue.feature_raw = 'auth_success'
    AND ue.user_id IS NOT NULL
  GROUP BY ue.event_date_utc
),
activated_by_day AS (
  SELECT ue.event_date_utc AS d, COUNT(DISTINCT ue.user_id) AS activated_users
  FROM analytics.usage_events_enriched ue
  INNER JOIN activation_features af ON af.feature_raw = ue.feature_raw
  INNER JOIN days dd ON dd.d = ue.event_date_utc
  WHERE ue.user_id IS NOT NULL
  GROUP BY ue.event_date_utc
),
purchase_by_day AS (
  SELECT (spa.created_at AT TIME ZONE 'UTC')::date AS d, COUNT(DISTINCT spa.user_id) AS purchase_users
  FROM public.subscription_plan_audit spa
  INNER JOIN days dd ON dd.d = (spa.created_at AT TIME ZONE 'UTC')::date
  GROUP BY 1
),
share_views_by_day AS (
  SELECT ue.event_date_utc AS d, COUNT(*) AS shared_plan_views
  FROM analytics.usage_events_enriched ue
  INNER JOIN days dd ON dd.d = ue.event_date_utc
  WHERE ue.feature_raw = 'shared_plan_view'
  GROUP BY ue.event_date_utc
),
recipe_views_by_day AS (
  SELECT ue.event_date_utc AS d, COUNT(*) AS recipe_views
  FROM analytics.usage_events_enriched ue
  INNER JOIN days dd ON dd.d = ue.event_date_utc
  WHERE ue.feature_raw = 'recipe_view'
  GROUP BY ue.event_date_utc
)
SELECT
  dd.d AS day_utc,
  COALESCE(a.active_users, 0) AS active_users,
  COALESCE(au.auth_users, 0) AS auth_success_users,
  COALESCE(ac.activated_users, 0) AS activated_users,
  COALESCE(p.purchase_users, 0) AS purchase_users_billing,
  COALESCE(s.shared_plan_views, 0) AS shared_plan_views,
  COALESCE(r.recipe_views, 0) AS recipe_views
FROM days dd
LEFT JOIN active_by_day a ON a.d = dd.d
LEFT JOIN auth_by_day au ON au.d = dd.d
LEFT JOIN activated_by_day ac ON ac.d = dd.d
LEFT JOIN purchase_by_day p ON p.d = dd.d
LEFT JOIN share_views_by_day s ON s.d = dd.d
LEFT JOIN recipe_views_by_day r ON r.d = dd.d
ORDER BY dd.d;
