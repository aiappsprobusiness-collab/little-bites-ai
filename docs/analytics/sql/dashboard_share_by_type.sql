-- =============================================================================
-- Dashboard: Share — воронка по типу ссылки (prop_share_type)
-- =============================================================================
-- Параметры: :from_utc, :to_utc
-- share_type: recipe | day_plan | week_plan | (unknown) — из share_link_created;
--   для планов также смотрим shared_plan_view + CTA (без share_type на view — см. gaps).
-- =============================================================================

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
created AS (
  SELECT
    COALESCE(NULLIF(trim(prop_share_type), ''), '(unknown)') AS share_type,
    COUNT(*) AS links_created
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'share_link_created'
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
  GROUP BY 1
),
plan_views AS (
  SELECT
    COALESCE(NULLIF(trim(prop_plan_scope), ''), '(no_scope)') AS plan_scope_bucket,
    COUNT(*) FILTER (WHERE feature_raw = 'shared_plan_view') AS views,
    COUNT(*) FILTER (WHERE feature_raw = 'shared_plan_not_found_view') AS not_found,
    COUNT(*) FILTER (
      WHERE feature_raw IN ('share_day_plan_cta_click', 'share_week_plan_cta_click')
    ) AS cta_clicks
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
    AND feature_raw IN (
      'shared_plan_view', 'shared_plan_not_found_view',
      'share_day_plan_cta_click', 'share_week_plan_cta_click'
    )
  GROUP BY 1
),
recipe_land AS (
  SELECT
    COUNT(*) FILTER (WHERE feature_raw = 'share_landing_view') AS recipe_landing_views,
    COUNT(*) FILTER (WHERE feature_raw = 'share_recipe_cta_click') AS recipe_cta_clicks
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE event_timestamp >= p.from_utc AND event_timestamp < p.to_utc
)
SELECT
  'share_link_created_by_type'::text AS section,
  c.share_type AS bucket,
  c.links_created AS metric_value,
  NULL::bigint AS secondary_metric
FROM created c
UNION ALL
SELECT
  'shared_plan_by_scope',
  p.plan_scope_bucket,
  p.views,
  p.cta_clicks
FROM plan_views p
UNION ALL
SELECT
  'recipe_share_landing',
  'recipe_flow',
  (SELECT recipe_landing_views FROM recipe_land),
  (SELECT recipe_cta_clicks FROM recipe_land)
ORDER BY section, bucket;
