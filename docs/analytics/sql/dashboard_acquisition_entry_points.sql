-- =============================================================================
-- Dashboard: Acquisition — первый entry_point до визита (proxy по колонке entry_point)
-- =============================================================================
-- Параметры: :from_utc, :to_utc — окно по event_timestamp (как в воронках).
--
-- Логика: для каждого visitor_key = COALESCE(anon_id, session_id::text) берём
--   первое по времени событие из landing_view, prelogin_view, shared_plan_view, share_landing_view;
--   entry_point — с этого события (пустое → '(unknown)').
--
-- Метрики:
--   visitors — уникальные visitor_key с таким первым касанием в окне
--   visitors_with_auth_success — те же ключи, у которых в окне есть auth_success с тем же anon_id
--     (если у auth нет anon_id — не попадут; см. funnel_acquisition gaps)
--   visitor_to_auth_pct
--   authed_users_with_activation — DISTINCT user_id среди auth_success с матчем visitor,
--     у кого после first_auth_at в окне до :to_utc есть активация (набор funnel_activation)
--   auth_to_activation_pct — среди authed_users (не среди visitors)
--
-- SoT: analytics.usage_events_enriched; альтернатива по «типу входа» без entry_point —
--   cohort_by_entry_point.sql (bucket по feature_raw).
-- =============================================================================

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
entry_features AS (
  SELECT unnest(ARRAY[
    'landing_view', 'prelogin_view', 'shared_plan_view', 'share_landing_view'
  ]::text[]) AS feature_raw
),
activation_features AS (
  SELECT unnest(ARRAY[
    'chat_recipe', 'plan_fill_day', 'favorite_add', 'plan_slot_replace_success',
    'plan_fill_day_success', 'help', 'recipe_view'
  ]::text[]) AS feature_raw
),
first_touch AS (
  SELECT DISTINCT ON (COALESCE(ue.anon_id, ue.session_id::text))
    COALESCE(ue.anon_id, ue.session_id::text) AS visitor_key,
    COALESCE(NULLIF(trim(ue.entry_point), ''), '(unknown)') AS entry_point,
    ue.event_timestamp AS first_touch_at,
    ue.anon_id AS touch_anon_id
  FROM analytics.usage_events_enriched ue
  INNER JOIN entry_features ef ON ef.feature_raw = ue.feature_raw
  CROSS JOIN params p
  WHERE ue.event_timestamp >= p.from_utc
    AND ue.event_timestamp < p.to_utc
    AND (ue.anon_id IS NOT NULL OR ue.session_id IS NOT NULL)
  ORDER BY COALESCE(ue.anon_id, ue.session_id::text), ue.event_timestamp ASC
),
auth_in_window AS (
  SELECT DISTINCT ON (ue.anon_id)
    ue.user_id,
    ue.anon_id,
    ue.event_timestamp AS auth_at
  FROM analytics.usage_events_enriched ue
  CROSS JOIN params p
  WHERE ue.feature_raw = 'auth_success'
    AND ue.user_id IS NOT NULL
    AND ue.anon_id IS NOT NULL
    AND ue.event_timestamp >= p.from_utc
    AND ue.event_timestamp < p.to_utc
  ORDER BY ue.anon_id, ue.event_timestamp ASC
),
touch_with_auth AS (
  SELECT
    ft.entry_point,
    ft.visitor_key,
    au.user_id,
    au.auth_at
  FROM first_touch ft
  LEFT JOIN auth_in_window au
    ON au.anon_id IS NOT NULL
    AND au.anon_id = ft.touch_anon_id
),
activated AS (
  SELECT DISTINCT twa.user_id
  FROM touch_with_auth twa
  INNER JOIN analytics.usage_events_enriched ue ON ue.user_id = twa.user_id
  INNER JOIN activation_features af ON af.feature_raw = ue.feature_raw
  CROSS JOIN params p
  WHERE twa.user_id IS NOT NULL
    AND ue.event_timestamp >= twa.auth_at
    AND ue.event_timestamp < p.to_utc
)
SELECT
  t.entry_point,
  COUNT(*) AS visitors_first_touch,
  COUNT(*) FILTER (WHERE t.user_id IS NOT NULL) AS visitors_with_auth_in_window,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE t.user_id IS NOT NULL) / NULLIF(COUNT(*), 0),
    2
  ) AS visitor_to_auth_pct,
  COUNT(DISTINCT t.user_id) FILTER (WHERE t.user_id IS NOT NULL) AS distinct_authed_users,
  COUNT(DISTINCT t.user_id) FILTER (
    WHERE t.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM activated a WHERE a.user_id = t.user_id)
  ) AS authed_users_activated,
  ROUND(
    100.0 * COUNT(DISTINCT t.user_id) FILTER (
      WHERE t.user_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM activated a WHERE a.user_id = t.user_id)
    ) / NULLIF(COUNT(DISTINCT t.user_id) FILTER (WHERE t.user_id IS NOT NULL), 0),
    2
  ) AS auth_to_activation_pct_among_authed
FROM touch_with_auth t
GROUP BY t.entry_point
ORDER BY visitors_first_touch DESC;
