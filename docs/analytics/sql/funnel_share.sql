-- Funnel: share / virality (рецепт и план)
--
-- GAP: нет usage_events «share_created» / «link_generated» при создании ссылки.
--      Рецепт: косвенно share_click + таблица share_refs (created_at).
--      План: только shared_plans.created_at (без mirror в usage_events).

-- 1) Публичный план: просмотр → CTA → (далее welcome/auth — отдельная воронка acquisition)
WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
)
SELECT
  COUNT(*) FILTER (WHERE feature_raw = 'shared_plan_view') AS shared_plan_views,
  COUNT(*) FILTER (WHERE feature_raw = 'shared_plan_not_found_view') AS shared_plan_not_found_views,
  COUNT(*) FILTER (WHERE feature_raw IN ('share_day_plan_cta_click', 'share_week_plan_cta_click')) AS shared_plan_cta_clicks,
  COUNT(DISTINCT prop_plan_ref) FILTER (WHERE feature_raw = 'shared_plan_view' AND prop_plan_ref IS NOT NULL) AS distinct_plans_viewed
FROM analytics.usage_events_enriched
CROSS JOIN params p
WHERE event_timestamp >= p.from_utc
  AND event_timestamp < p.to_utc
  AND event_group = 'share';

-- 2) Рецепт: share_landing_view → share_recipe_cta_click (в том же окне; связка по anon/session грубая)
WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
land AS (
  SELECT DISTINCT COALESCE(anon_id, session_id::text) AS k
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'share_landing_view'
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
    AND (anon_id IS NOT NULL OR session_id IS NOT NULL)
),
cta AS (
  SELECT DISTINCT COALESCE(anon_id, session_id::text) AS k
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'share_recipe_cta_click'
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
    AND (anon_id IS NOT NULL OR session_id IS NOT NULL)
)
SELECT
  (SELECT COUNT(*) FROM land) AS visitors_share_landing,
  (SELECT COUNT(*) FROM cta) AS visitors_recipe_cta,
  (SELECT COUNT(*) FROM land INNER JOIN cta ON cta.k = land.k) AS visitors_land_and_cta;

-- 3) Новые строки share_refs (создание короткой ссылки рецепта) — не событие, таблица
-- SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS d, COUNT(*) FROM public.share_refs GROUP BY 1 ORDER BY 1;
