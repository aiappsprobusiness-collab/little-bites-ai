-- =============================================================================
-- Dashboard: Recipe engagement (recipe_view) — разбивка по source
-- =============================================================================
-- Параметры: :from_utc, :to_utc
-- is_public: true — публичный маршрут (см. STAGE5_TELEMETRY_ADDITIONS.md).
-- =============================================================================

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
)
SELECT
  COALESCE(NULLIF(trim(ue.properties ->> 'source'), ''), '(null)') AS recipe_view_source,
  COUNT(*) AS recipe_view_events,
  COUNT(DISTINCT ue.user_id) FILTER (WHERE ue.user_id IS NOT NULL) AS unique_authenticated_viewers,
  COUNT(*) FILTER (WHERE COALESCE((ue.properties ->> 'is_public')::boolean, false)) AS views_public_route,
  COUNT(*) FILTER (WHERE NOT COALESCE((ue.properties ->> 'is_public')::boolean, false)) AS views_in_app_or_non_public
FROM analytics.usage_events_enriched ue
CROSS JOIN params p
WHERE ue.feature_raw = 'recipe_view'
  AND ue.event_timestamp >= p.from_utc
  AND ue.event_timestamp < p.to_utc
GROUP BY 1
ORDER BY recipe_view_events DESC;
