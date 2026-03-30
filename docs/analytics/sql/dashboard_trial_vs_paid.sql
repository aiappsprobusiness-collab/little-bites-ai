-- =============================================================================
-- Dashboard: Trial vs paid (грубые объёмы по событиям + audit)
-- =============================================================================
-- Параметры: :from_utc, :to_utc
--
-- GAP: «paid» без отдельного события — только subscription_plan_audit и trial_started.
--   Состояние подписки в profiles_v2 в этом pack не джойним (отдельный запрос / service_role).
--   Когортная конверсия trial → paid по одному окну не интерпретируется как когорта без
--   явного time-ordered funnel по user_id.
--
-- billing_over_trial_started_users_pct_proxy — только отношение объёмов в окне, не конверсия когорты.
-- =============================================================================

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
trial_u AS (
  SELECT COUNT(DISTINCT user_id) AS n
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'trial_started'
    AND user_id IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
billing_u AS (
  SELECT COUNT(DISTINCT spa.user_id) AS n
  FROM public.subscription_plan_audit spa
  CROSS JOIN params p
  WHERE spa.created_at >= p.from_utc AND spa.created_at < p.to_utc
),
client_ev AS (
  SELECT
    COUNT(DISTINCT user_id) FILTER (WHERE feature_raw = 'purchase_start' AND user_id IS NOT NULL) AS u_pstart,
    COUNT(DISTINCT user_id) FILTER (WHERE feature_raw = 'purchase_success' AND user_id IS NOT NULL) AS u_psucc
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
    AND feature_raw IN ('purchase_start', 'purchase_success')
)
SELECT
  (SELECT n FROM trial_u) AS distinct_users_trial_started,
  c.u_pstart AS distinct_users_purchase_start,
  c.u_psucc AS distinct_users_purchase_success_client,
  (SELECT n FROM billing_u) AS distinct_users_billing_confirmed,
  ROUND(
    100.0 * (SELECT n FROM billing_u) / NULLIF((SELECT n FROM trial_u), 0),
    2
  ) AS billing_over_trial_started_users_ratio_pct_window_proxy
FROM client_ev c;
