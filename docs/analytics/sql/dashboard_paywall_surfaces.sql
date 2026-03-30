-- =============================================================================
-- Dashboard: Paywall — поверхности × причина (для BI)
-- =============================================================================
-- Логика идентична paywall_surface_performance.sql; колонки с префиксом dashboard_* убраны
-- в пользу коротких имён для Metabase.
-- Параметры: :from_utc, :to_utc
-- =============================================================================

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
first_pw AS (
  SELECT DISTINCT ON (ue.user_id)
    ue.user_id,
    COALESCE(ue.properties ->> 'paywall_surface', '(null_unified_legacy)') AS paywall_surface,
    COALESCE(ue.properties ->> 'paywall_reason', '(null)') AS paywall_reason
  FROM analytics.usage_events_enriched ue
  CROSS JOIN params p
  WHERE ue.feature_raw = 'paywall_view'
    AND ue.user_id IS NOT NULL
    AND ue.event_timestamp >= p.from_utc
    AND ue.event_timestamp < p.to_utc
  ORDER BY ue.user_id, ue.event_timestamp ASC
),
primary_click AS (
  SELECT DISTINCT user_id
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'paywall_primary_click'
    AND user_id IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
pstart AS (
  SELECT DISTINCT user_id
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'purchase_start'
    AND user_id IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
billing AS (
  SELECT DISTINCT spa.user_id
  FROM public.subscription_plan_audit spa
  CROSS JOIN params p
  WHERE spa.created_at >= p.from_utc
    AND spa.created_at < p.to_utc
)
SELECT
  fp.paywall_surface,
  fp.paywall_reason,
  COUNT(*) AS users_first_paywall,
  COUNT(*) FILTER (WHERE pc.user_id IS NOT NULL) AS users_primary_click,
  COUNT(*) FILTER (WHERE ps.user_id IS NOT NULL) AS users_purchase_start,
  COUNT(*) FILTER (WHERE b.user_id IS NOT NULL) AS users_billing_confirmed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE pc.user_id IS NOT NULL) / NULLIF(COUNT(*), 0), 2)
    AS conv_view_to_click_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ps.user_id IS NOT NULL) / NULLIF(COUNT(*), 0), 2)
    AS conv_view_to_purchase_start_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE b.user_id IS NOT NULL) / NULLIF(COUNT(*), 0), 2)
    AS conv_view_to_billing_pct,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE b.user_id IS NOT NULL)
    / NULLIF(COUNT(*) FILTER (WHERE pc.user_id IS NOT NULL), 0),
    2
  ) AS conv_click_to_billing_pct
FROM first_pw fp
LEFT JOIN primary_click pc ON pc.user_id = fp.user_id
LEFT JOIN pstart ps ON ps.user_id = fp.user_id
LEFT JOIN billing b ON b.user_id = fp.user_id
GROUP BY fp.paywall_surface, fp.paywall_reason
ORDER BY users_first_paywall DESC;
