-- =============================================================================
-- Dashboard: Share — дневной тренд воронки (UTC)
-- =============================================================================
-- Параметры: :last_n_days, :through_date (UTC date)
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
)
SELECT
  dd.d AS day_utc,
  COUNT(*) FILTER (WHERE ue.feature_raw = 'share_link_created') AS share_link_created,
  COUNT(*) FILTER (WHERE ue.feature_raw = 'shared_plan_view') AS shared_plan_views,
  COUNT(*) FILTER (WHERE ue.feature_raw = 'shared_plan_not_found_view') AS shared_plan_not_found,
  COUNT(*) FILTER (
    WHERE ue.feature_raw IN ('share_day_plan_cta_click', 'share_week_plan_cta_click')
  ) AS shared_plan_cta_clicks,
  COUNT(*) FILTER (WHERE ue.feature_raw = 'share_landing_view') AS recipe_share_landing_views,
  COUNT(*) FILTER (WHERE ue.feature_raw = 'share_recipe_cta_click') AS recipe_share_cta_clicks
FROM days dd
LEFT JOIN analytics.usage_events_enriched ue ON ue.event_date_utc = dd.d
  AND ue.feature_raw IN (
    'share_link_created', 'shared_plan_view', 'shared_plan_not_found_view',
    'share_day_plan_cta_click', 'share_week_plan_cta_click',
    'share_landing_view', 'share_recipe_cta_click'
  )
GROUP BY dd.d
ORDER BY dd.d;
