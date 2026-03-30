-- =============================================================================
-- Dashboard: Share / virality — обзор за окно
-- =============================================================================
-- Параметры: :from_utc, :to_utc
--
-- share_link_created — Stage 5 telemetry (событие)
-- shared_plan_view / not_found — события
-- shared_plan_cta_clicks — day + week CTA
-- auth_reach_after_shared_plan — DISTINCT user_id (anon stitch как share_quality_diagnostics)
-- =============================================================================

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
ue AS (
  SELECT *
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE event_timestamp >= p.from_utc AND event_timestamp < p.to_utc
),
saw_plan AS (
  SELECT DISTINCT anon_id
  FROM ue
  WHERE feature_raw = 'shared_plan_view' AND anon_id IS NOT NULL
),
authed_after AS (
  SELECT COUNT(DISTINCT ue.user_id) AS n
  FROM analytics.usage_events_enriched ue
  CROSS JOIN params p
  INNER JOIN saw_plan sp ON sp.anon_id = ue.anon_id
  WHERE ue.feature_raw = 'auth_success'
    AND ue.user_id IS NOT NULL
    AND ue.event_timestamp >= p.from_utc
    AND ue.event_timestamp < p.to_utc
)
SELECT
  COUNT(*) FILTER (WHERE ue.feature_raw = 'share_link_created') AS share_link_created_events,
  COUNT(*) FILTER (WHERE ue.feature_raw = 'shared_plan_view') AS shared_plan_view_events,
  COUNT(*) FILTER (WHERE ue.feature_raw = 'shared_plan_not_found_view') AS shared_plan_not_found_events,
  COUNT(*) FILTER (
    WHERE ue.feature_raw IN ('share_day_plan_cta_click', 'share_week_plan_cta_click')
  ) AS shared_plan_cta_click_events,
  COUNT(DISTINCT ue.prop_plan_ref) FILTER (
    WHERE ue.feature_raw = 'shared_plan_view' AND ue.prop_plan_ref IS NOT NULL
  ) AS distinct_plan_refs_viewed,
  (SELECT n FROM authed_after) AS auth_users_after_shared_plan_anon_stitch
FROM ue;
