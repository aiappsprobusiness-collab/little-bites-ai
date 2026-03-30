-- Сводка KPI за один UTC-день (замените :day на дату, например '2026-03-30')

WITH day_bounds AS (
  SELECT
    '2026-03-30 00:00:00+00'::timestamptz AS d0,
    '2026-03-31 00:00:00+00'::timestamptz AS d1
),
ue AS (
  SELECT *
  FROM analytics.usage_events_enriched
  CROSS JOIN day_bounds b
  WHERE event_timestamp >= b.d0
    AND event_timestamp < b.d1
),
auth_users AS (
  SELECT COUNT(DISTINCT user_id) AS n
  FROM ue
  WHERE feature_raw = 'auth_success' AND user_id IS NOT NULL
),
activated AS (
  SELECT COUNT(DISTINCT user_id) AS n
  FROM ue
  WHERE feature_raw IN (
    'chat_recipe', 'plan_fill_day', 'favorite_add', 'plan_slot_replace_success', 'plan_fill_day_success', 'help', 'recipe_view'
  )
    AND user_id IS NOT NULL
),
paywall_views AS (
  SELECT COUNT(DISTINCT user_id) AS n FROM ue WHERE feature_raw = 'paywall_view' AND user_id IS NOT NULL
),
billing AS (
  SELECT COUNT(DISTINCT user_id) AS n
  FROM public.subscription_plan_audit spa
  CROSS JOIN day_bounds b
  WHERE spa.created_at >= b.d0 AND spa.created_at < b.d1
)
SELECT
  (SELECT COUNT(DISTINCT user_id) FROM ue WHERE user_id IS NOT NULL) AS dau_authenticated,
  (SELECT COUNT(DISTINCT COALESCE(anon_id, session_id::text)) FROM ue WHERE anon_id IS NOT NULL OR session_id IS NOT NULL)
    AS rough_distinct_visitors_anon_or_session,
  (SELECT n FROM auth_users) AS new_auth_success_users_today,
  (SELECT n FROM activated) AS users_with_activation_signal_today,
  (SELECT n FROM paywall_views) AS users_paywall_view_today,
  (SELECT n FROM billing) AS users_billing_audit_today,
  (SELECT COUNT(*) FROM ue WHERE feature_raw = 'chat_recipe') AS server_chat_recipe_count_today,
  (SELECT COUNT(*) FROM ue WHERE feature_raw = 'plan_fill_day') AS server_plan_fill_day_count_today;

-- WAU / MAU: замените окно на 7 / 30 дней и используйте тот же шаблон с COUNT(DISTINCT user_id).
