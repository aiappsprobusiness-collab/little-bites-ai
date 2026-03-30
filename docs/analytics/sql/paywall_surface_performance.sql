-- =============================================================================
-- Paywall: сравнение поверхностей (Stage 4)
-- =============================================================================
-- Атрибуция: первый paywall_view пользователя в окне [from_utc, to_utc) задаёт
--   surface = COALESCE(properties->>'paywall_surface', '(null_unified_legacy)')
--   reason  = COALESCE(properties->>'paywall_reason', '(null)')
-- Unified/Legacy paywall часто не шлёт paywall_surface — тогда bucket (null_*).
--
-- Метрики по каждой паре (surface, reason):
--   users_first_paywall — уникальные user_id
--   users_primary_click — пересечение с paywall_primary_click в том же окне
--   users_purchase_start — пересечение с purchase_start
--   users_billing — пересечение с subscription_plan_audit.created_at в окне
--
-- False interest / drop-off: смотрите строки с высоким view→click и низким click→billing.
--
-- Trial vs premium (GAP-heavy):
--   trial_started и purchase_start / audit различимы, но «trial user» без явного subscription
--   state в БД не отличить от premium без профиля/Stripe — ниже вспомогательный счётчик событий.
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
  COUNT(*) AS users_first_paywall_in_window,
  COUNT(*) FILTER (WHERE pc.user_id IS NOT NULL) AS users_with_primary_click,
  COUNT(*) FILTER (WHERE ps.user_id IS NOT NULL) AS users_with_purchase_start,
  COUNT(*) FILTER (WHERE b.user_id IS NOT NULL) AS users_with_billing_in_window,
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
ORDER BY users_first_paywall_in_window DESC;

-- Trial vs premium: грубые объёмы событий в окне (не когорта)
WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
)
SELECT
  COUNT(DISTINCT user_id) FILTER (WHERE feature_raw = 'trial_started') AS distinct_users_trial_started,
  COUNT(DISTINCT user_id) FILTER (WHERE feature_raw = 'purchase_start') AS distinct_users_purchase_start,
  COUNT(DISTINCT user_id) FILTER (WHERE feature_raw = 'purchase_success') AS distinct_users_purchase_success_client
FROM analytics.usage_events_enriched
CROSS JOIN params p
WHERE user_id IS NOT NULL
  AND event_timestamp >= p.from_utc
  AND event_timestamp < p.to_utc
  AND feature_raw IN ('trial_started', 'purchase_start', 'purchase_success');
