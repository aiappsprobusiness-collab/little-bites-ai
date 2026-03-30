-- =============================================================================
-- Dashboard: Share — качество ref (план) и «мёртвые» ветки
-- =============================================================================
-- Параметры: :from_utc, :to_utc
-- Согласовано с share_quality_diagnostics.sql (ref-level proxy).
--
-- not_found_rate_pct — доля not_found среди (view + not_found) по событиям
-- plan_refs_view_no_cta — DISTINCT prop_plan_ref с view без CTA по тому же ref в окне
-- plan_refs_cta_no_auth — ref, по которым был CTA, но нет auth_success с тем же anon_id
--   в окне после первого CTA (грубый proxy; см. gaps в retention-and-cohorts / Stage 4)
-- =============================================================================

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
plan_events AS (
  SELECT *
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
    AND feature_raw IN (
      'shared_plan_view', 'shared_plan_not_found_view',
      'share_day_plan_cta_click', 'share_week_plan_cta_click'
    )
),
rates AS (
  SELECT
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE feature_raw = 'shared_plan_not_found_view')
      / NULLIF(COUNT(*) FILTER (WHERE feature_raw IN ('shared_plan_view', 'shared_plan_not_found_view')), 0),
      2
    ) AS not_found_rate_pct,
    COUNT(DISTINCT prop_plan_ref) FILTER (
      WHERE feature_raw = 'shared_plan_view' AND prop_plan_ref IS NOT NULL
    ) AS distinct_refs_viewed
  FROM plan_events
),
views AS (
  SELECT DISTINCT prop_plan_ref AS ref
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'shared_plan_view'
    AND prop_plan_ref IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
ctas AS (
  SELECT DISTINCT prop_plan_ref AS ref
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw IN ('share_day_plan_cta_click', 'share_week_plan_cta_click')
    AND prop_plan_ref IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
cta_events AS (
  SELECT
    prop_plan_ref AS ref,
    anon_id,
    MIN(event_timestamp) AS first_cta_at
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw IN ('share_day_plan_cta_click', 'share_week_plan_cta_click')
    AND prop_plan_ref IS NOT NULL
    AND anon_id IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
  GROUP BY prop_plan_ref, anon_id
),
cta_with_auth AS (
  SELECT DISTINCT ce.ref
  FROM cta_events ce
  INNER JOIN analytics.usage_events_enriched ue ON ue.anon_id = ce.anon_id
  CROSS JOIN params p
  WHERE ue.feature_raw = 'auth_success'
    AND ue.user_id IS NOT NULL
    AND ue.event_timestamp >= ce.first_cta_at
    AND ue.event_timestamp < p.to_utc
)
SELECT
  (SELECT not_found_rate_pct FROM rates) AS not_found_rate_pct,
  (SELECT distinct_refs_viewed FROM rates) AS distinct_plan_refs_with_view,
  (SELECT COUNT(*) FROM views v WHERE NOT EXISTS (SELECT 1 FROM ctas c WHERE c.ref = v.ref))
    AS plan_refs_view_no_cta_in_window,
  (SELECT COUNT(*) FROM ctas c WHERE NOT EXISTS (SELECT 1 FROM cta_with_auth a WHERE a.ref = c.ref))
    AS plan_refs_with_cta_but_no_auth_stitch_in_window;
