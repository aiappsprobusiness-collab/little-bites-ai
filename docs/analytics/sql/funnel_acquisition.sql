-- Funnel: acquisition → auth
-- Шаги (по событиям): (1) вход на лендинг / shared plan (2) CTA (3) auth_page_view (4) auth_success
-- Ограничение: anon_id и user_id не всегда стыкуются в одной сессии — конверсия «анон → зарегистрированный»
-- надёжнее по cohort anon_id с последующим auth_success с тем же anon_id (если клиент сохраняет anon).

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
step_entry AS (
  SELECT DISTINCT COALESCE(anon_id, session_id::text) AS visitor_key, MIN(event_timestamp) AS t0
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
    AND feature_raw IN ('landing_view', 'prelogin_view', 'shared_plan_view', 'share_landing_view')
    AND (anon_id IS NOT NULL OR session_id IS NOT NULL)
  GROUP BY COALESCE(anon_id, session_id::text)
),
step_cta AS (
  SELECT DISTINCT COALESCE(anon_id, session_id::text) AS visitor_key
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
    AND feature_raw IN (
      'landing_cta_free_click', 'landing_cta_login_click', 'prelogin_cta_click',
      'landing_demo_save_click', 'share_recipe_cta_click', 'share_day_plan_cta_click', 'share_week_plan_cta_click'
    )
    AND (anon_id IS NOT NULL OR session_id IS NOT NULL)
),
step_auth_page AS (
  SELECT DISTINCT COALESCE(anon_id, session_id::text) AS visitor_key
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
    AND feature_raw = 'auth_page_view'
    AND (anon_id IS NOT NULL OR session_id IS NOT NULL)
),
step_auth_success AS (
  SELECT COUNT(DISTINCT user_id) AS cnt
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'auth_success'
    AND user_id IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
)
SELECT
  (SELECT COUNT(*) FROM step_entry) AS step1_entry_visitors,
  (SELECT COUNT(*) FROM step_cta) AS step2_cta_visitors,
  (SELECT COUNT(*) FROM step_auth_page) AS step3_auth_page_visitors,
  (SELECT cnt FROM step_auth_success) AS step4_auth_success_users,
  ROUND(100.0 * (SELECT COUNT(*) FROM step_cta) / NULLIF((SELECT COUNT(*) FROM step_entry), 0), 2) AS entry_to_cta_pct;

-- Когорта anon → registered: пользователи с auth_success, у которых тот же anon_id был на entry/cta раньше
WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
)
SELECT COUNT(DISTINCT s.user_id) AS users_registered_with_prior_anon_touch
FROM analytics.usage_events_enriched s
CROSS JOIN params p
WHERE s.feature_raw = 'auth_success'
  AND s.user_id IS NOT NULL
  AND s.anon_id IS NOT NULL
  AND s.event_timestamp >= p.from_utc
  AND s.event_timestamp < p.to_utc
  AND EXISTS (
    SELECT 1
    FROM analytics.usage_events_enriched e
    WHERE e.anon_id = s.anon_id
      AND e.event_timestamp < s.event_timestamp
      AND e.feature_raw IN (
        'landing_view', 'shared_plan_view', 'share_landing_view', 'landing_cta_free_click',
        'share_recipe_cta_click', 'share_day_plan_cta_click', 'share_week_plan_cta_click'
      )
  );
