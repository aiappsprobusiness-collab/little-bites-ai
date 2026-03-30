-- Replace: plan_slot_replace_success по пользователям и source (properties)
-- Источник: analytics.usage_events_enriched (feature_raw = plan_slot_replace_success)

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
)
SELECT
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS users_with_any_replace,
  COUNT(*) AS replace_events_total,
  ROUND(1.0 * COUNT(*) / NULLIF(COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL), 0), 2)
    AS avg_replaces_per_user
FROM analytics.usage_events_enriched
CROSS JOIN params p
WHERE feature_raw = 'plan_slot_replace_success'
  AND event_timestamp >= p.from_utc
  AND event_timestamp < p.to_utc;

-- Распределение по source (JSON)
WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
)
SELECT
  COALESCE(prop_source, '(null)') AS replace_source,
  COUNT(*) AS cnt
FROM analytics.usage_events_enriched
CROSS JOIN params p
WHERE feature_raw = 'plan_slot_replace_success'
  AND event_timestamp >= p.from_utc
  AND event_timestamp < p.to_utc
GROUP BY 1
ORDER BY cnt DESC;

-- Избранное: уникальные пользователи с favorite_add
WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
)
SELECT
  COUNT(DISTINCT user_id) AS users_favorite_add,
  COUNT(*) AS favorite_add_events
FROM analytics.usage_events_enriched
CROSS JOIN params p
WHERE feature_raw = 'favorite_add'
  AND user_id IS NOT NULL
  AND event_timestamp >= p.from_utc
  AND event_timestamp < p.to_utc;

-- Stage 5: attempt → success / fail (одна попытка = один attempt с пула/AI/auto; assign через replaceSlotWithRecipe даёт свой attempt)
WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
)
SELECT
  COUNT(*) FILTER (WHERE feature_raw = 'plan_slot_replace_attempt') AS attempts,
  COUNT(*) FILTER (WHERE feature_raw = 'plan_slot_replace_success') AS successes,
  COUNT(*) FILTER (WHERE feature_raw = 'plan_slot_replace_fail') AS fails,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE feature_raw = 'plan_slot_replace_success')
    / NULLIF(COUNT(*) FILTER (WHERE feature_raw = 'plan_slot_replace_attempt'), 0),
    2
  ) AS success_per_attempt_pct
FROM analytics.usage_events_enriched
CROSS JOIN params p
WHERE feature_raw IN ('plan_slot_replace_attempt', 'plan_slot_replace_success', 'plan_slot_replace_fail')
  AND event_timestamp >= p.from_utc
  AND event_timestamp < p.to_utc;

-- recipe_view: см. funnel_activation / retention (SoT просмотра карточки рецепта).
