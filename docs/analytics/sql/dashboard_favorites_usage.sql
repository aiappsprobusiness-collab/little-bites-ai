-- =============================================================================
-- Dashboard: Favorites usage
-- =============================================================================
-- Параметры: :from_utc, :to_utc
--
-- GAP: нет канонического favorite_remove в taxonomy для всех поверхностей; «активные избранные»
--   в БД (recipes.is_favorite) — отдельная модель, не дублируем здесь.
-- =============================================================================

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
)
SELECT
  COUNT(*) AS favorite_add_events,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS distinct_users_favorite_add
FROM analytics.usage_events_enriched
CROSS JOIN params p
WHERE feature_raw = 'favorite_add'
  AND event_timestamp >= p.from_utc
  AND event_timestamp < p.to_utc;
