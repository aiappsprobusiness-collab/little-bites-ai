-- =============================================================================
-- Dashboard: Core feature usage по дням (UTC)
-- =============================================================================
-- Параметры: :last_n_days, :through_date
-- Счётчики событий + уникальные user_id (где применимо) по ключевым фичам.
-- =============================================================================

WITH params AS (
  SELECT
    28 AS last_n_days,
    '2026-03-30'::date AS through_date
),
days AS (
  SELECT generate_series(
    p.through_date - (p.last_n_days - 1),
    p.through_date,
    '1 day'::interval
  )::date AS d
  FROM params p
),
agg AS (
  SELECT
    ue.event_date_utc AS d,
    COUNT(*) FILTER (WHERE ue.feature_raw = 'plan_fill_day') AS plan_fill_day_events,
    COUNT(DISTINCT ue.user_id) FILTER (
      WHERE ue.feature_raw = 'plan_fill_day' AND ue.user_id IS NOT NULL
    ) AS plan_fill_day_users,
    COUNT(*) FILTER (WHERE ue.feature_raw = 'chat_recipe') AS chat_recipe_events,
    COUNT(DISTINCT ue.user_id) FILTER (
      WHERE ue.feature_raw = 'chat_recipe' AND ue.user_id IS NOT NULL
    ) AS chat_recipe_users,
    COUNT(*) FILTER (WHERE ue.feature_raw = 'recipe_view') AS recipe_view_events,
    COUNT(DISTINCT ue.user_id) FILTER (
      WHERE ue.feature_raw = 'recipe_view' AND ue.user_id IS NOT NULL
    ) AS recipe_view_users,
    COUNT(*) FILTER (WHERE ue.feature_raw = 'share_link_created') AS share_link_created_events,
    COUNT(*) FILTER (WHERE ue.feature_raw = 'plan_slot_replace_attempt') AS replace_attempt_events,
    COUNT(*) FILTER (WHERE ue.feature_raw = 'favorite_add') AS favorite_add_events,
    COUNT(DISTINCT ue.user_id) FILTER (
      WHERE ue.feature_raw = 'favorite_add' AND ue.user_id IS NOT NULL
    ) AS favorite_add_users
  FROM analytics.usage_events_enriched ue
  INNER JOIN days dd ON dd.d = ue.event_date_utc
  WHERE ue.feature_raw IN (
    'plan_fill_day', 'chat_recipe', 'recipe_view', 'share_link_created',
    'plan_slot_replace_attempt', 'favorite_add'
  )
  GROUP BY ue.event_date_utc
)
SELECT
  dd.d AS day_utc,
  COALESCE(a.plan_fill_day_events, 0) AS plan_fill_day_events,
  COALESCE(a.plan_fill_day_users, 0) AS plan_fill_day_users,
  COALESCE(a.chat_recipe_events, 0) AS chat_recipe_events,
  COALESCE(a.chat_recipe_users, 0) AS chat_recipe_users,
  COALESCE(a.recipe_view_events, 0) AS recipe_view_events,
  COALESCE(a.recipe_view_users, 0) AS recipe_view_users,
  COALESCE(a.share_link_created_events, 0) AS share_link_created_events,
  COALESCE(a.replace_attempt_events, 0) AS replace_attempt_events,
  COALESCE(a.favorite_add_events, 0) AS favorite_add_events,
  COALESCE(a.favorite_add_users, 0) AS favorite_add_users
FROM days dd
LEFT JOIN agg a ON a.d = dd.d
ORDER BY dd.d;
