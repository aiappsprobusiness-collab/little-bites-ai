-- =============================================================================
-- Когорты по типу входа (Stage 4)
-- =============================================================================
-- Классификация user_id: по ПЕРВОМУ событию до first_auth с тем же anon_id,
-- среди {landing_view, prelogin_view, shared_plan_view, share_landing_view}.
-- Если anon отсутствует или нет таких событий → bucket other_unknown.
--
-- Метрики на когорту (пользователи с first_auth в [cohort_from, cohort_to)):
--   auth conversion — всегда 100% внутри выборки (все уже зарегистрированы);
--   activation conversion — доля с активацией (набор как funnel_activation);
--   paywall conversion — доля с paywall_view после first_auth;
--   purchase conversion — доля с subscription_plan_audit (до data_through).
--
-- Ограничение: entry_point колонка на auth_success не используется здесь — только
-- pre-auth события по anon_id; иначе много other_unknown.
-- =============================================================================

WITH params AS (
  SELECT
    '2026-01-01'::date AS cohort_from,
    '2026-04-01'::date AS cohort_to,
    '2026-04-15'::timestamptz AS data_through_ts
),
first_auth AS (
  SELECT DISTINCT ON (ue.user_id)
    ue.user_id,
    ue.event_timestamp AS first_auth_at,
    ue.anon_id AS anon_at_auth
  FROM analytics.usage_events_enriched ue
  WHERE ue.feature_raw = 'auth_success'
    AND ue.user_id IS NOT NULL
  ORDER BY ue.user_id, ue.event_timestamp ASC
),
cohort_users AS (
  SELECT fa.*
  FROM first_auth fa
  CROSS JOIN params p
  WHERE (fa.first_auth_at AT TIME ZONE 'UTC')::date >= p.cohort_from
    AND (fa.first_auth_at AT TIME ZONE 'UTC')::date < p.cohort_to
),
prior_events AS (
  SELECT
    c.user_id,
    e.feature_raw,
    e.event_timestamp
  FROM cohort_users c
  INNER JOIN analytics.usage_events_enriched e
    ON e.anon_id = c.anon_at_auth
    AND c.anon_at_auth IS NOT NULL
    AND e.event_timestamp < c.first_auth_at
    AND e.feature_raw IN ('landing_view', 'prelogin_view', 'shared_plan_view', 'share_landing_view')
),
first_prior AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    feature_raw
  FROM prior_events
  ORDER BY user_id, event_timestamp ASC
),
bucketed AS (
  SELECT
    c.user_id,
    c.first_auth_at,
    CASE fp.feature_raw
      WHEN 'landing_view' THEN 'landing'
      WHEN 'prelogin_view' THEN 'prelogin'
      WHEN 'shared_plan_view' THEN 'shared_plan'
      WHEN 'share_landing_view' THEN 'shared_recipe'
      ELSE 'other_unknown'
    END AS entry_bucket
  FROM cohort_users c
  LEFT JOIN first_prior fp ON fp.user_id = c.user_id
),
activation AS (
  SELECT DISTINCT b.user_id
  FROM bucketed b
  INNER JOIN analytics.usage_events_enriched ue ON ue.user_id = b.user_id
  CROSS JOIN params p
  WHERE ue.feature_raw IN (
      'chat_recipe', 'plan_fill_day', 'favorite_add',
      'plan_slot_replace_success', 'plan_fill_day_success', 'help', 'recipe_view'
    )
    AND ue.event_timestamp >= b.first_auth_at
    AND ue.event_timestamp <= p.data_through_ts
),
paywall AS (
  SELECT DISTINCT b.user_id
  FROM bucketed b
  INNER JOIN analytics.usage_events_enriched ue ON ue.user_id = b.user_id
  CROSS JOIN params p
  WHERE ue.feature_raw = 'paywall_view'
    AND ue.event_timestamp >= b.first_auth_at
    AND ue.event_timestamp <= p.data_through_ts
),
purchase AS (
  SELECT DISTINCT b.user_id
  FROM bucketed b
  INNER JOIN public.subscription_plan_audit spa ON spa.user_id = b.user_id
  CROSS JOIN params p
  WHERE spa.created_at <= p.data_through_ts
)
SELECT
  b.entry_bucket,
  COUNT(*) AS cohort_users,
  COUNT(*) FILTER (WHERE a.user_id IS NOT NULL) AS activated,
  ROUND(100.0 * COUNT(*) FILTER (WHERE a.user_id IS NOT NULL) / NULLIF(COUNT(*), 0), 2)
    AS activation_rate_pct,
  COUNT(*) FILTER (WHERE pw.user_id IS NOT NULL) AS paywall_reach,
  ROUND(100.0 * COUNT(*) FILTER (WHERE pw.user_id IS NOT NULL) / NULLIF(COUNT(*), 0), 2)
    AS paywall_reach_pct,
  COUNT(*) FILTER (WHERE pu.user_id IS NOT NULL) AS purchase_reach,
  ROUND(100.0 * COUNT(*) FILTER (WHERE pu.user_id IS NOT NULL) / NULLIF(COUNT(*), 0), 2)
    AS purchase_reach_pct
FROM bucketed b
LEFT JOIN activation a ON a.user_id = b.user_id
LEFT JOIN paywall pw ON pw.user_id = b.user_id
LEFT JOIN purchase pu ON pu.user_id = b.user_id
GROUP BY b.entry_bucket
ORDER BY cohort_users DESC;
