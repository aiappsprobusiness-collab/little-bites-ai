-- Funnel: activation после первого auth_success
-- Активация: chat_recipe, plan_fill_day, favorite_add, plan_slot_replace_success,
-- plan_fill_day_success, help, recipe_view (Stage 5 — просмотр карточки рецепта).

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
first_auth AS (
  SELECT
    ue.user_id,
    MIN(ue.event_timestamp) AS first_auth_at
  FROM analytics.usage_events_enriched ue
  CROSS JOIN params p
  WHERE ue.feature_raw = 'auth_success'
    AND ue.user_id IS NOT NULL
    AND ue.event_timestamp >= p.from_utc
    AND ue.event_timestamp < p.to_utc
  GROUP BY ue.user_id
),
activation_events AS (
  SELECT
    ue.user_id,
    MIN(ue.event_timestamp) AS first_activation_at
  FROM analytics.usage_events_enriched ue
  INNER JOIN first_auth fa ON fa.user_id = ue.user_id
  CROSS JOIN params p
    WHERE ue.feature_raw IN (
      'chat_recipe',
      'plan_fill_day',
      'favorite_add',
      'plan_slot_replace_success',
      'plan_fill_day_success',
      'help',
      'recipe_view'
    )
    AND ue.event_timestamp >= fa.first_auth_at
    AND ue.event_timestamp < p.to_utc
  GROUP BY ue.user_id
),
time_to_act AS (
  SELECT EXTRACT(EPOCH FROM (ae.first_activation_at - fa.first_auth_at)) AS sec
  FROM first_auth fa
  INNER JOIN activation_events ae ON ae.user_id = fa.user_id
)
SELECT
  (SELECT COUNT(*) FROM first_auth) AS users_with_auth_success_in_window,
  (SELECT COUNT(*) FROM activation_events) AS users_activated_after_auth,
  ROUND(
    100.0 * (SELECT COUNT(*) FROM activation_events) / NULLIF((SELECT COUNT(*) FROM first_auth), 0),
    2
  ) AS activation_rate_pct,
  ROUND((SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sec) FROM time_to_act)::numeric, 0)
    AS median_seconds_to_activation;
