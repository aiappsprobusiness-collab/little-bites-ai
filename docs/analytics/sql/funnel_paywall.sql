-- Funnel: paywall (продукт) → подтверждение оплаты (billing truth)
-- Шаги: paywall_view → paywall_primary_click → purchase_start → subscription_plan_audit
-- purchase_success — клиентский исход страницы оплаты; финансовый факт — audit.

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
users_window AS (
  SELECT DISTINCT user_id
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE user_id IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
step_paywall_view AS (
  SELECT DISTINCT user_id
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'paywall_view'
    AND user_id IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
step_primary AS (
  SELECT DISTINCT user_id
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'paywall_primary_click'
    AND user_id IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
step_purchase_start AS (
  SELECT DISTINCT user_id
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'purchase_start'
    AND user_id IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
step_audit AS (
  SELECT DISTINCT spa.user_id
  FROM public.subscription_plan_audit spa
  CROSS JOIN params p
  WHERE spa.created_at >= p.from_utc
    AND spa.created_at < p.to_utc
)
SELECT
  (SELECT COUNT(*) FROM step_paywall_view) AS step1_paywall_view_users,
  (SELECT COUNT(*) FROM step_primary) AS step2_primary_click_users,
  (SELECT COUNT(*) FROM step_purchase_start) AS step3_purchase_start_users,
  (SELECT COUNT(*) FROM step_audit) AS step4_billing_confirmed_users,
  ROUND(100.0 * (SELECT COUNT(*) FROM step_primary) / NULLIF((SELECT COUNT(*) FROM step_paywall_view), 0), 2)
    AS conv_view_to_primary_pct,
  ROUND(100.0 * (SELECT COUNT(*) FROM step_audit) / NULLIF((SELECT COUNT(*) FROM step_paywall_view), 0), 2)
    AS conv_view_to_billing_pct;

-- Связка «после paywall_view первая запись audit» (упрощённо, без жёсткого порядка событий):
-- SELECT ue.user_id, MIN(ue.event_timestamp) AS first_paywall, MIN(spa.created_at) AS first_audit
-- FROM analytics.usage_events_enriched ue
-- JOIN public.subscription_plan_audit spa ON spa.user_id = ue.user_id AND spa.created_at >= ue.event_timestamp
-- WHERE ue.feature_raw = 'paywall_view' ...
