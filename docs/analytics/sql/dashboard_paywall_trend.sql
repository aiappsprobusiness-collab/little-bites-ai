-- =============================================================================
-- Dashboard: Paywall — дневной тренд (UTC)
-- =============================================================================
-- Параметры: :last_n_days, :through_date
-- purchase_users_billing — DISTINCT user_id по subscription_plan_audit (день UTC)
-- conv_view_to_billing_pct — billing_users / paywall_view_users (тот же день; proxy)
-- =============================================================================

WITH params AS (
  SELECT
    28 AS last_n_days,
    '2026-03-30'::date AS through_date
),
days AS (
  SELECT generate_series(
    p.through_date - (p.last_n_days - 1),
    p.through_date,
    '1 day'::interval
  )::date AS d
  FROM params p
),
pw AS (
  SELECT event_date_utc AS d, COUNT(DISTINCT user_id) AS paywall_users
  FROM analytics.usage_events_enriched
  WHERE feature_raw = 'paywall_view' AND user_id IS NOT NULL
  GROUP BY event_date_utc
),
pc AS (
  SELECT event_date_utc AS d, COUNT(DISTINCT user_id) AS primary_click_users
  FROM analytics.usage_events_enriched
  WHERE feature_raw = 'paywall_primary_click' AND user_id IS NOT NULL
  GROUP BY event_date_utc
),
bill AS (
  SELECT (created_at AT TIME ZONE 'UTC')::date AS d, COUNT(DISTINCT user_id) AS billing_users
  FROM public.subscription_plan_audit
  GROUP BY 1
)
SELECT
  dd.d AS day_utc,
  COALESCE(pw.paywall_users, 0) AS paywall_view_users,
  COALESCE(pc.primary_click_users, 0) AS paywall_primary_click_users,
  COALESCE(bi.billing_users, 0) AS purchase_users_billing,
  ROUND(
    100.0 * COALESCE(bi.billing_users, 0)::numeric / NULLIF(COALESCE(pw.paywall_users, 0), 0),
    2
  ) AS conv_view_to_billing_proxy_pct_same_day
FROM days dd
LEFT JOIN pw ON pw.d = dd.d
LEFT JOIN pc ON pc.d = dd.d
LEFT JOIN bill bi ON bi.d = dd.d
ORDER BY dd.d;
