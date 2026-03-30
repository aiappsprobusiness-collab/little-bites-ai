-- =============================================================================
-- Dashboard: Replace usage (attempt / success / fail)
-- =============================================================================
-- Параметры: :from_utc, :to_utc
-- Success rate = successes / attempts (как replace_engagement.sql Stage 5).
-- =============================================================================

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
)
SELECT
  COALESCE(NULLIF(trim(prop_source), ''), '(null)') AS replace_source,
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
WHERE event_timestamp >= p.from_utc
  AND event_timestamp < p.to_utc
  AND feature_raw IN ('plan_slot_replace_attempt', 'plan_slot_replace_success', 'plan_slot_replace_fail')
GROUP BY 1
ORDER BY attempts DESC;
