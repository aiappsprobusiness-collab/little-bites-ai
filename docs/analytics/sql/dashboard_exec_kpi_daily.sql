-- =============================================================================
-- Dashboard: Executive — KPI за один UTC-день (одна строка)
-- =============================================================================
-- Параметр: :reference_date — дата в UTC (например '2026-03-30').
--
-- Определения (согласованы с wau_mau_stickiness.sql / retention):
--   dau / wau / mau — только user_id с «active use» (meaningful_features).
--   activated_users_today — уникальные user_id с событием активации (как funnel_activation).
--   paywall_conversion_proxy — users с billing audit в этот день / users с paywall_view в этот день
--     (не когортная воронка; для когорты см. funnel_paywall.sql).
--   purchase_users_today — DISTINCT user_id в subscription_plan_audit за день.
--   share_link_created_events — COUNT событий share_link_created (Stage 5).
-- =============================================================================

WITH params AS (
  SELECT '2026-03-30'::date AS reference_date
),
bounds AS (
  SELECT
    p.reference_date AS d_ref,
    p.reference_date - 6 AS w_start,
    p.reference_date - 29 AS m_start,
    (p.reference_date AT TIME ZONE 'UTC')::timestamptz AS day_start,
    ((p.reference_date + 1) AT TIME ZONE 'UTC')::timestamptz AS day_end
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
dau AS (
  SELECT COUNT(DISTINCT ue.user_id) AS n
  FROM analytics.usage_events_enriched ue
  INNER JOIN active_features af ON af.feature_raw = ue.feature_raw
  CROSS JOIN bounds b
  WHERE ue.user_id IS NOT NULL
    AND ue.event_date_utc = b.d_ref
),
wau AS (
  SELECT COUNT(DISTINCT ue.user_id) AS n
  FROM analytics.usage_events_enriched ue
  INNER JOIN active_features af ON af.feature_raw = ue.feature_raw
  CROSS JOIN bounds b
  WHERE ue.user_id IS NOT NULL
    AND ue.event_date_utc >= b.w_start
    AND ue.event_date_utc <= b.d_ref
),
mau AS (
  SELECT COUNT(DISTINCT ue.user_id) AS n
  FROM analytics.usage_events_enriched ue
  INNER JOIN active_features af ON af.feature_raw = ue.feature_raw
  CROSS JOIN bounds b
  WHERE ue.user_id IS NOT NULL
    AND ue.event_date_utc >= b.m_start
    AND ue.event_date_utc <= b.d_ref
),
activated_today AS (
  SELECT COUNT(DISTINCT ue.user_id) AS n
  FROM analytics.usage_events_enriched ue
  INNER JOIN activation_features af ON af.feature_raw = ue.feature_raw
  CROSS JOIN bounds b
  WHERE ue.user_id IS NOT NULL
    AND ue.event_date_utc = b.d_ref
),
paywall_today AS (
  SELECT COUNT(DISTINCT ue.user_id) AS n
  FROM analytics.usage_events_enriched ue
  CROSS JOIN bounds b
  WHERE ue.feature_raw = 'paywall_view'
    AND ue.user_id IS NOT NULL
    AND ue.event_date_utc = b.d_ref
),
billing_today AS (
  SELECT COUNT(DISTINCT spa.user_id) AS n
  FROM public.subscription_plan_audit spa
  CROSS JOIN bounds b
  WHERE spa.created_at >= b.day_start
    AND spa.created_at < b.day_end
),
billing_rows_today AS (
  SELECT COUNT(*) AS n
  FROM public.subscription_plan_audit spa
  CROSS JOIN bounds b
  WHERE spa.created_at >= b.day_start
    AND spa.created_at < b.day_end
),
share_created AS (
  SELECT COUNT(*) AS n
  FROM analytics.usage_events_enriched ue
  CROSS JOIN bounds b
  WHERE ue.feature_raw = 'share_link_created'
    AND ue.event_timestamp >= b.day_start
    AND ue.event_timestamp < b.day_end
)
SELECT
  (SELECT reference_date FROM params) AS reference_date_utc,
  (SELECT n FROM dau) AS dau_active_users,
  (SELECT n FROM wau) AS wau_active_users,
  (SELECT n FROM mau) AS mau_active_users,
  ROUND((SELECT n FROM dau)::numeric / NULLIF((SELECT n FROM wau), 0), 4) AS stickiness_dau_over_wau,
  ROUND((SELECT n FROM dau)::numeric / NULLIF((SELECT n FROM mau), 0), 4) AS stickiness_dau_over_mau,
  (SELECT n FROM activated_today) AS activated_users_today,
  (SELECT n FROM paywall_today) AS paywall_view_users_today,
  (SELECT n FROM billing_today) AS purchase_users_billing_today,
  (SELECT n FROM billing_rows_today) AS purchase_audit_rows_today,
  ROUND(
    100.0 * (SELECT n FROM billing_today) / NULLIF((SELECT n FROM paywall_today), 0),
    2
  ) AS paywall_to_billing_proxy_pct_same_day,
  (SELECT n FROM share_created) AS share_link_created_events_today;
