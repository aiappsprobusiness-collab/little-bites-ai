-- =============================================================================
-- Dashboard: Activation funnel (таблица шагов)
-- =============================================================================
-- Те же шаги, что funnel_acquisition.sql; один результат с step_order для графика воронки.
--
-- Параметры: :from_utc, :to_utc
-- =============================================================================

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
step_entry AS (
  SELECT COUNT(*) AS n FROM (
    SELECT DISTINCT COALESCE(anon_id, session_id::text)
    FROM analytics.usage_events_enriched
    CROSS JOIN params p
    WHERE event_timestamp >= p.from_utc AND event_timestamp < p.to_utc
      AND feature_raw IN ('landing_view', 'prelogin_view', 'shared_plan_view', 'share_landing_view')
      AND (anon_id IS NOT NULL OR session_id IS NOT NULL)
  ) s
),
step_cta AS (
  SELECT COUNT(*) AS n FROM (
    SELECT DISTINCT COALESCE(anon_id, session_id::text)
    FROM analytics.usage_events_enriched
    CROSS JOIN params p
    WHERE event_timestamp >= p.from_utc AND event_timestamp < p.to_utc
      AND feature_raw IN (
        'landing_cta_free_click', 'landing_cta_login_click', 'prelogin_cta_click',
        'landing_demo_save_click', 'share_recipe_cta_click', 'share_day_plan_cta_click',
        'share_week_plan_cta_click'
      )
      AND (anon_id IS NOT NULL OR session_id IS NOT NULL)
  ) s
),
step_auth_page AS (
  SELECT COUNT(*) AS n FROM (
    SELECT DISTINCT COALESCE(anon_id, session_id::text)
    FROM analytics.usage_events_enriched
    CROSS JOIN params p
    WHERE event_timestamp >= p.from_utc AND event_timestamp < p.to_utc
      AND feature_raw = 'auth_page_view'
      AND (anon_id IS NOT NULL OR session_id IS NOT NULL)
  ) s
),
step_auth_success AS (
  SELECT COUNT(DISTINCT user_id) AS n
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'auth_success'
    AND user_id IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
steps AS (
  SELECT 1 AS step_order, '1_entry_visitors'::text AS step_key, 'Entry (landing / shared)'::text AS step_label, (SELECT n FROM step_entry) AS users
  UNION ALL
  SELECT 2, '2_cta_visitors', 'CTA click', (SELECT n FROM step_cta)
  UNION ALL
  SELECT 3, '3_auth_page_visitors', 'Auth page view', (SELECT n FROM step_auth_page)
  UNION ALL
  SELECT 4, '4_auth_success_users', 'Auth success (users)', (SELECT n FROM step_auth_success)
),
entry_cnt AS (
  SELECT users AS entry_users FROM steps WHERE step_order = 1
)
SELECT
  s.step_order,
  s.step_key,
  s.step_label,
  s.users,
  ROUND(100.0 * s.users / NULLIF(LAG(s.users) OVER (ORDER BY s.step_order), 0), 2) AS pct_of_prev_step,
  ROUND(100.0 * s.users / NULLIF((SELECT entry_users FROM entry_cnt), 0), 2) AS pct_of_entry
FROM steps s
ORDER BY s.step_order;
