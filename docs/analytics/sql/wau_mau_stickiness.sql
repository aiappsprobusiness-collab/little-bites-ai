-- =============================================================================
-- DAU / WAU / MAU и stickiness (Stage 4)
-- =============================================================================
-- Якорь: as_of_date (UTC календарная дата последнего дня окна).
--   DAU = уникальные user_id с ≥1 событием «active use» в дату as_of_date.
--   WAU = уникальные user_id с активностью на интервале [as_of_date - 6, as_of_date] (7 дней).
--   MAU = уникальные user_id на [as_of_date - 29, as_of_date] (30 дней).
-- Stickiness: DAU/WAU и DAU/MAU для этого якоря (классическое определение на конец периода).
--
-- CANONICAL ACTIVE USE (совпадает с retention activity в retention_d1_d7_d30.sql):
--   chat_recipe, plan_fill_day, help, favorite_add, plan_slot_replace_success,
--   plan_fill_day_success, chat_generate_success, member_create_success,
--   plan_fill_day_click, chat_open, plan_view_day, share_click, recipe_view
--
-- НЕ считаем за активность сами по себе:
--   paywall_*, landing_*, prelogin_*, auth_* (кроме смысла «сессии»), ad_rewarded_*,
--   только просмотры share_landing / shared_plan без продукта.
--
-- GAP: пользователь мог открыть приложение без попадания в этот список — DAU занижен.
-- GAP: анонимы не входят в DAU/WAU/MAU здесь.
-- =============================================================================

WITH params AS (
  SELECT '2026-03-30'::date AS as_of_date
),
active_features AS (
  SELECT unnest(ARRAY[
    'chat_recipe',
    'plan_fill_day',
    'help',
    'favorite_add',
    'plan_slot_replace_success',
    'plan_fill_day_success',
    'chat_generate_success',
    'member_create_success',
    'plan_fill_day_click',
    'chat_open',
    'plan_view_day',
    'share_click',
    'recipe_view'
  ]::text[]) AS feature_raw
),
bounds AS (
  SELECT
    p.as_of_date AS d_end,
    p.as_of_date - 6 AS w_start,
    p.as_of_date - 29 AS m_start
  FROM params p
),
dau AS (
  SELECT COUNT(DISTINCT ue.user_id) AS n
  FROM analytics.usage_events_enriched ue
  INNER JOIN active_features af ON af.feature_raw = ue.feature_raw
  CROSS JOIN params p
  CROSS JOIN bounds b
  WHERE ue.user_id IS NOT NULL
    AND ue.event_date_utc = b.d_end
),
wau AS (
  SELECT COUNT(DISTINCT ue.user_id) AS n
  FROM analytics.usage_events_enriched ue
  INNER JOIN active_features af ON af.feature_raw = ue.feature_raw
  CROSS JOIN bounds b
  WHERE ue.user_id IS NOT NULL
    AND ue.event_date_utc >= b.w_start
    AND ue.event_date_utc <= b.d_end
),
mau AS (
  SELECT COUNT(DISTINCT ue.user_id) AS n
  FROM analytics.usage_events_enriched ue
  INNER JOIN active_features af ON af.feature_raw = ue.feature_raw
  CROSS JOIN bounds b
  WHERE ue.user_id IS NOT NULL
    AND ue.event_date_utc >= b.m_start
    AND ue.event_date_utc <= b.d_end
)
SELECT
  (SELECT as_of_date FROM params) AS as_of_date,
  (SELECT n FROM dau) AS dau,
  (SELECT n FROM wau) AS wau,
  (SELECT n FROM mau) AS mau,
  ROUND((SELECT n FROM dau)::numeric / NULLIF((SELECT n FROM wau), 0), 4) AS stickiness_dau_wau,
  ROUND((SELECT n FROM dau)::numeric / NULLIF((SELECT n FROM mau), 0), 4) AS stickiness_dau_mau;
