-- =============================================================================
-- Dashboard: Purchase — клиент vs billing
-- =============================================================================
-- Параметры: :from_utc, :to_utc
--
-- Финансовый факт: subscription_plan_audit (webhook).
-- Клиент: purchase_success, purchase_error, purchase_start (см. ANALYTICS_EVENT_TAXONOMY_STAGE2).
-- =============================================================================

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
client AS (
  SELECT
    COUNT(*) FILTER (WHERE feature_raw = 'purchase_start') AS purchase_start_events,
    COUNT(DISTINCT user_id) FILTER (WHERE feature_raw = 'purchase_start' AND user_id IS NOT NULL)
      AS distinct_users_purchase_start,
    COUNT(*) FILTER (WHERE feature_raw = 'purchase_success') AS purchase_success_events,
    COUNT(DISTINCT user_id) FILTER (WHERE feature_raw = 'purchase_success' AND user_id IS NOT NULL)
      AS distinct_users_purchase_success_client,
    COUNT(*) FILTER (WHERE feature_raw = 'purchase_error') AS purchase_error_events,
    COUNT(DISTINCT user_id) FILTER (WHERE feature_raw = 'purchase_error' AND user_id IS NOT NULL)
      AS distinct_users_purchase_error_client
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
    AND feature_raw IN ('purchase_start', 'purchase_success', 'purchase_error')
),
billing AS (
  SELECT
    COUNT(*) AS billing_audit_rows,
    COUNT(DISTINCT user_id) AS distinct_users_billing_audit
  FROM public.subscription_plan_audit spa
  CROSS JOIN params p
  WHERE spa.created_at >= p.from_utc AND spa.created_at < p.to_utc
)
SELECT
  c.distinct_users_purchase_start,
  c.distinct_users_purchase_success_client,
  c.distinct_users_purchase_error_client,
  c.purchase_start_events,
  c.purchase_success_events,
  c.purchase_error_events,
  b.distinct_users_billing_audit,
  b.billing_audit_rows,
  ROUND(
    100.0 * b.distinct_users_billing_audit / NULLIF(c.distinct_users_purchase_success_client, 0),
    2
  ) AS billing_users_per_purchase_success_users_ratio_pct
FROM client c
CROSS JOIN billing b;
