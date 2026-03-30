-- =============================================================================
-- Product health: сводный снимок (Stage 4)
-- =============================================================================
-- Один ряд метрик за окно [from_utc, to_utc). Подставьте даты.
-- Часть метрик — «объёмы в окне», не строгие когорты; для когорт используйте
-- retention_d1_d7_d30 / cohort_* / funnel_*.
--
-- engagement_proxy: среди user_id с ≥1 событием из active_features в окне — сколько имели
--   активность в ≥2 разных календарных UTC-днях (не то же самое, что D7 retention; для D7 см.
--   retention_d1_d7_d30.sql).
-- =============================================================================

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
active_features AS (
  SELECT unnest(ARRAY[
    'chat_recipe', 'plan_fill_day', 'help', 'favorite_add', 'plan_slot_replace_success',
    'plan_fill_day_success', 'chat_generate_success', 'member_create_success',
    'plan_fill_day_click', 'chat_open', 'plan_view_day', 'share_click', 'recipe_view'
  ]::text[]) AS feature_raw
),
activation_features AS (
  SELECT unnest(ARRAY[
    'chat_recipe', 'plan_fill_day', 'favorite_add', 'plan_slot_replace_success', 'plan_fill_day_success', 'help', 'recipe_view'
  ]::text[]) AS feature_raw
),
acquisition_volume AS (
  SELECT COUNT(*) AS entry_events
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
    AND feature_raw IN ('landing_view', 'prelogin_view', 'shared_plan_view', 'share_landing_view')
),
auth_in_window AS (
  SELECT COUNT(DISTINCT user_id) AS n
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'auth_success'
    AND user_id IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
activated_in_window AS (
  SELECT COUNT(DISTINCT user_id) AS n
  FROM analytics.usage_events_enriched ue
  CROSS JOIN params p
  INNER JOIN activation_features af ON af.feature_raw = ue.feature_raw
  WHERE ue.user_id IS NOT NULL
    AND ue.event_timestamp >= p.from_utc
    AND ue.event_timestamp < p.to_utc
),
paywall_users AS (
  SELECT COUNT(DISTINCT user_id) AS n
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'paywall_view'
    AND user_id IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
billing_users AS (
  SELECT COUNT(DISTINCT user_id) AS n
  FROM public.subscription_plan_audit
  CROSS JOIN params p
  WHERE created_at >= p.from_utc
    AND created_at < p.to_utc
),
share_views AS (
  SELECT COUNT(*) AS n
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
    AND feature_raw IN ('shared_plan_view', 'share_landing_view')
),
share_cta AS (
  SELECT COUNT(*) AS n
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
    AND feature_raw IN (
      'share_recipe_cta_click', 'share_day_plan_cta_click', 'share_week_plan_cta_click'
    )
),
replace_users AS (
  SELECT COUNT(DISTINCT user_id) AS n
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'plan_slot_replace_success'
    AND user_id IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
fav_users AS (
  SELECT COUNT(DISTINCT user_id) AS n
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'favorite_add'
    AND user_id IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
engagement_multi_day AS (
  SELECT
    COUNT(*) FILTER (WHERE days >= 2) AS users_2plus_active_days,
    COUNT(*) AS users_any_active_day
  FROM (
    SELECT
      ue.user_id,
      COUNT(DISTINCT ue.event_date_utc) AS days
    FROM analytics.usage_events_enriched ue
    CROSS JOIN params p
    INNER JOIN active_features af ON af.feature_raw = ue.feature_raw
    WHERE ue.user_id IS NOT NULL
      AND ue.event_timestamp >= p.from_utc
      AND ue.event_timestamp < p.to_utc
    GROUP BY ue.user_id
  ) t
)
SELECT
  (SELECT from_utc FROM params) AS window_from_utc,
  (SELECT to_utc FROM params) AS window_to_utc,
  (SELECT entry_events FROM acquisition_volume) AS acquisition_entry_events,
  (SELECT n FROM auth_in_window) AS auth_success_distinct_users,
  (SELECT n FROM activated_in_window) AS activation_signal_distinct_users,
  ROUND(
    100.0 * (SELECT n FROM activated_in_window) / NULLIF((SELECT n FROM auth_in_window), 0),
    2
  ) AS activation_to_auth_ratio_pct_window,
  (SELECT n FROM paywall_users) AS paywall_view_distinct_users,
  (SELECT n FROM billing_users) AS billing_audit_distinct_users,
  ROUND(
    100.0 * (SELECT n FROM billing_users) / NULLIF((SELECT n FROM paywall_users), 0),
    2
  ) AS billing_per_paywall_viewer_pct_window,
  (SELECT n FROM share_views) AS share_view_events,
  (SELECT n FROM share_cta) AS share_cta_events,
  ROUND(100.0 * (SELECT n FROM share_cta) / NULLIF((SELECT n FROM share_views), 0), 2)
    AS share_cta_per_view_events_pct_window,
  (SELECT n FROM replace_users) AS replace_distinct_users,
  (SELECT n FROM fav_users) AS favorite_add_distinct_users,
  (SELECT users_any_active_day FROM engagement_multi_day) AS active_users_distinct_any_day,
  (SELECT users_2plus_active_days FROM engagement_multi_day) AS active_users_2plus_calendar_days,
  ROUND(
    100.0 * (SELECT users_2plus_active_days FROM engagement_multi_day)
    / NULLIF((SELECT users_any_active_day FROM engagement_multi_day), 0),
    2
  ) AS pct_active_users_with_2plus_days;
