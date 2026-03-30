-- =============================================================================
-- Retention D1 / D7 / D30 (Stage 4)
-- =============================================================================
-- Источник: analytics.usage_events_enriched (+ при сегментах paid — subscription_plan_audit)
--
-- COHORT START (основной сценарий — зарегистрированные):
--   cohort_date = UTC-дата ПЕРВОГО события auth_success для user_id (за всё время данных).
--   В когорту попадают только пользователи, у которых эта дата в [cohort_from, cohort_to).
--
-- RETENTION ACTIVITY («вернулся»):
--   Хотя бы одно событие в день (UTC) из набора meaningful product actions (совпадает с
--   активацией Stage 3 + несколько сигналов вовлечённости):
--   chat_recipe, plan_fill_day, help, favorite_add, plan_slot_replace_success,
--   plan_fill_day_success, chat_generate_success, member_create_success,
--   plan_fill_day_click, chat_open, plan_view_day, share_click, recipe_view
--   НЕ считаются: paywall_*, landing_*, prelogin_*, auth_*, ad_rewarded_*, share_* views alone
--   (share_click — считаем как engagement).
--
-- D1 / D7 / D30 (календарные UTC):
--   D1  = активность в дату cohort_date + 1
--   D7  = активность в дату cohort_date + 7
--   D30 = активность в дату cohort_date + 30
--
-- ЦЕНЗУРИРОВАНИЕ (right-censoring):
--   Считаем retention только для пользователей, у которых соответствующий день уже наступил
--   и не позже data_through (иначе занижаем знаменатель). Например D30 только если
--   cohort_date + 30 <= data_through.
--
-- ANON / STITCHING:
--   Retention только по user_id. Анонимные визиты без связки anon→user в этот SQL не входят.
--   Если anon_id меняется в браузере — когорта «до auth» ломается (см. acquisition funnel).
-- =============================================================================

WITH params AS (
  SELECT
    '2026-01-01'::date AS cohort_from,
    '2026-03-01'::date AS cohort_to,
    '2026-04-15'::date AS data_through
),
meaningful_features AS (
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
first_auth AS (
  SELECT
    ue.user_id,
    MIN(ue.event_timestamp) AS first_auth_at,
    (MIN(ue.event_timestamp) AT TIME ZONE 'UTC')::date AS cohort_date
  FROM analytics.usage_events_enriched ue
  WHERE ue.feature_raw = 'auth_success'
    AND ue.user_id IS NOT NULL
  GROUP BY ue.user_id
),
cohort_users AS (
  SELECT fa.user_id, fa.cohort_date, fa.first_auth_at
  FROM first_auth fa
  CROSS JOIN params p
  WHERE fa.cohort_date >= p.cohort_from
    AND fa.cohort_date < p.cohort_to
),
activity_days AS (
  SELECT DISTINCT
    ue.user_id,
    ue.event_date_utc AS d
  FROM analytics.usage_events_enriched ue
  INNER JOIN meaningful_features mf ON mf.feature_raw = ue.feature_raw
  CROSS JOIN params p
  WHERE ue.user_id IS NOT NULL
    AND ue.event_date_utc <= p.data_through
),
enriched AS (
  SELECT
    c.user_id,
    c.cohort_date,
    (c.cohort_date + 1) <= p.data_through AS eligible_d1,
    (c.cohort_date + 7) <= p.data_through AS eligible_d7,
    (c.cohort_date + 30) <= p.data_through AS eligible_d30,
    EXISTS (
      SELECT 1 FROM activity_days a
      WHERE a.user_id = c.user_id AND a.d = c.cohort_date + 1
    ) AS retained_d1,
    EXISTS (
      SELECT 1 FROM activity_days a
      WHERE a.user_id = c.user_id AND a.d = c.cohort_date + 7
    ) AS retained_d7,
    EXISTS (
      SELECT 1 FROM activity_days a
      WHERE a.user_id = c.user_id AND a.d = c.cohort_date + 30
    ) AS retained_d30
  FROM cohort_users c
  CROSS JOIN params p
)
SELECT
  COUNT(*) AS cohort_users,
  SUM(CASE WHEN eligible_d1 THEN 1 ELSE 0 END) AS eligible_for_d1,
  SUM(CASE WHEN eligible_d1 AND retained_d1 THEN 1 ELSE 0 END) AS retained_d1,
  ROUND(
    100.0 * SUM(CASE WHEN eligible_d1 AND retained_d1 THEN 1 ELSE 0 END)
    / NULLIF(SUM(CASE WHEN eligible_d1 THEN 1 ELSE 0 END), 0),
    2
  ) AS retention_d1_pct,
  SUM(CASE WHEN eligible_d7 THEN 1 ELSE 0 END) AS eligible_for_d7,
  SUM(CASE WHEN eligible_d7 AND retained_d7 THEN 1 ELSE 0 END) AS retained_d7,
  ROUND(
    100.0 * SUM(CASE WHEN eligible_d7 AND retained_d7 THEN 1 ELSE 0 END)
    / NULLIF(SUM(CASE WHEN eligible_d7 THEN 1 ELSE 0 END), 0),
    2
  ) AS retention_d7_pct,
  SUM(CASE WHEN eligible_d30 THEN 1 ELSE 0 END) AS eligible_for_d30,
  SUM(CASE WHEN eligible_d30 AND retained_d30 THEN 1 ELSE 0 END) AS retained_d30,
  ROUND(
    100.0 * SUM(CASE WHEN eligible_d30 AND retained_d30 THEN 1 ELSE 0 END)
    / NULLIF(SUM(CASE WHEN eligible_d30 THEN 1 ELSE 0 END), 0),
    2
  ) AS retention_d30_pct
FROM enriched;

-- -----------------------------------------------------------------------------
-- Part 2: те же метрики по сегментам (одна строка = один сегмент)
-- Сегменты: activated_ever | signed_up_only; paid_ever (audit) | not_paid;
--           acquisition_flow: landing | shared_plan | shared_recipe | prelogin | other
-- -----------------------------------------------------------------------------

WITH params AS (
  SELECT
    '2026-01-01'::date AS cohort_from,
    '2026-03-01'::date AS cohort_to,
    '2026-04-15'::date AS data_through
),
activation_features AS (
  SELECT unnest(ARRAY[
    'chat_recipe', 'plan_fill_day', 'favorite_add', 'plan_slot_replace_success',
    'plan_fill_day_success', 'help', 'recipe_view'
  ]::text[]) AS feature_raw
),
meaningful_features AS (
  SELECT unnest(ARRAY[
    'chat_recipe', 'plan_fill_day', 'help', 'favorite_add', 'plan_slot_replace_success',
    'plan_fill_day_success', 'chat_generate_success', 'member_create_success',
    'plan_fill_day_click', 'chat_open', 'plan_view_day', 'share_click', 'recipe_view'
  ]::text[]) AS feature_raw
),
first_auth AS (
  SELECT DISTINCT ON (ue.user_id)
    ue.user_id,
    ue.event_timestamp AS first_auth_at,
    (ue.event_timestamp AT TIME ZONE 'UTC')::date AS cohort_date,
    ue.anon_id AS anon_at_first_auth
  FROM analytics.usage_events_enriched ue
  WHERE ue.feature_raw = 'auth_success'
    AND ue.user_id IS NOT NULL
  ORDER BY ue.user_id, ue.event_timestamp ASC
),
cohort_users AS (
  SELECT fa.*
  FROM first_auth fa
  CROSS JOIN params p
  WHERE fa.cohort_date >= p.cohort_from
    AND fa.cohort_date < p.cohort_to
),
activated AS (
  SELECT DISTINCT c.user_id
  FROM cohort_users c
  INNER JOIN analytics.usage_events_enriched ue ON ue.user_id = c.user_id
  INNER JOIN activation_features af ON af.feature_raw = ue.feature_raw
  WHERE ue.event_timestamp >= c.first_auth_at
),
paid AS (
  SELECT DISTINCT spa.user_id
  FROM public.subscription_plan_audit spa
),
prior_events AS (
  SELECT
    c.user_id,
    e.feature_raw,
    e.event_timestamp
  FROM cohort_users c
  INNER JOIN analytics.usage_events_enriched e
    ON e.anon_id = c.anon_at_first_auth
    AND c.anon_at_first_auth IS NOT NULL
    AND e.event_timestamp < c.first_auth_at
    AND e.feature_raw IN ('shared_plan_view', 'share_landing_view', 'landing_view', 'prelogin_view')
),
prior_touch AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    feature_raw AS first_bucket_feature
  FROM prior_events
  ORDER BY user_id, event_timestamp ASC
),
user_segment AS (
  SELECT
    c.user_id,
    c.cohort_date,
    c.first_auth_at,
    CASE WHEN a.user_id IS NOT NULL THEN 'activated_ever' ELSE 'signed_up_only' END AS seg_activation,
    CASE WHEN p.user_id IS NOT NULL THEN 'paid_ever' ELSE 'not_paid' END AS seg_paid,
    CASE pt.first_bucket_feature
      WHEN 'shared_plan_view' THEN 'shared_plan'
      WHEN 'share_landing_view' THEN 'shared_recipe'
      WHEN 'prelogin_view' THEN 'prelogin'
      WHEN 'landing_view' THEN 'landing'
      ELSE 'other_unknown'
    END AS seg_flow
  FROM cohort_users c
  LEFT JOIN activated a ON a.user_id = c.user_id
  LEFT JOIN paid p ON p.user_id = c.user_id
  LEFT JOIN prior_touch pt ON pt.user_id = c.user_id
),
activity_days AS (
  SELECT DISTINCT ue.user_id, ue.event_date_utc AS d
  FROM analytics.usage_events_enriched ue
  INNER JOIN meaningful_features mf ON mf.feature_raw = ue.feature_raw
  CROSS JOIN params p
  WHERE ue.user_id IS NOT NULL
    AND ue.event_date_utc <= p.data_through
),
by_segment AS (
  SELECT
    s.seg_activation,
    s.seg_paid,
    s.seg_flow,
    s.user_id,
    s.cohort_date,
    (s.cohort_date + 7) <= p.data_through AS eligible_d7,
    EXISTS (
      SELECT 1 FROM activity_days a
      WHERE a.user_id = s.user_id AND a.d = s.cohort_date + 7
    ) AS retained_d7
  FROM user_segment s
  CROSS JOIN params p
)
SELECT
  seg_activation,
  seg_paid,
  seg_flow,
  COUNT(*) AS cohort_users,
  SUM(CASE WHEN eligible_d7 THEN 1 ELSE 0 END) AS eligible_d7,
  SUM(CASE WHEN eligible_d7 AND retained_d7 THEN 1 ELSE 0 END) AS retained_d7,
  ROUND(
    100.0 * SUM(CASE WHEN eligible_d7 AND retained_d7 THEN 1 ELSE 0 END)
    / NULLIF(SUM(CASE WHEN eligible_d7 THEN 1 ELSE 0 END), 0),
    2
  ) AS retention_d7_pct
FROM by_segment
GROUP BY seg_activation, seg_paid, seg_flow
ORDER BY cohort_users DESC;
