-- =============================================================================
-- Share / virality: качество и диагностика (Stage 4)
-- =============================================================================
-- Метрики в окне [from_utc, to_utc):
--   shared_plan_view / shared_plan_not_found_view (counts + distinct plan_ref)
--   CTA click rate: клики day/week на просмотры (грубо: события / события; не уникальные визиторы)
--   auth reach после shared flow: anon_id видел shared_plan_view, затем auth_success с тем же
--      anon_id в окне до to_utc (не обязательно «следом в тот же день»)
--   activation reach: из тех же пользователей — активация после first_auth (набор Stage 3)
--
-- GAP: нельзя надёжно связать prop_plan_ref на anon → user без сохранения ref в auth;
--      ref «view но без follow-up» считаем по DISTINCT prop_plan_ref без последующего CTA
--      (только anon/session, same window).
-- GAP: auth после shared_plan без anon_id на обоих шагах не попадёт в stitch.
-- =============================================================================

WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
plan_events AS (
  SELECT *
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
    AND feature_raw IN (
      'shared_plan_view', 'shared_plan_not_found_view',
      'share_day_plan_cta_click', 'share_week_plan_cta_click'
    )
)
SELECT
  COUNT(*) FILTER (WHERE feature_raw = 'shared_plan_view') AS shared_plan_views,
  COUNT(*) FILTER (WHERE feature_raw = 'shared_plan_not_found_view') AS shared_plan_not_found_views,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE feature_raw = 'shared_plan_not_found_view')
    / NULLIF(
      COUNT(*) FILTER (WHERE feature_raw IN ('shared_plan_view', 'shared_plan_not_found_view')),
      0
    ),
    2
  ) AS not_found_share_of_plan_views_pct,
  COUNT(*) FILTER (WHERE feature_raw IN ('share_day_plan_cta_click', 'share_week_plan_cta_click'))
    AS shared_plan_cta_clicks,
  COUNT(DISTINCT prop_plan_ref) FILTER (
    WHERE feature_raw = 'shared_plan_view' AND prop_plan_ref IS NOT NULL
  ) AS distinct_plans_viewed,
  COUNT(DISTINCT prop_plan_ref) FILTER (
    WHERE feature_raw = 'shared_plan_not_found_view' AND prop_plan_ref IS NOT NULL
  ) AS distinct_plans_not_found
FROM plan_events;

-- Разбивка day vs week (prop_plan_scope в properties; может быть NULL)
WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
)
SELECT
  COALESCE(NULLIF(trim(prop_plan_scope), ''), '(no_scope)') AS plan_scope_bucket,
  COUNT(*) FILTER (WHERE feature_raw = 'shared_plan_view') AS views,
  COUNT(*) FILTER (WHERE feature_raw = 'shared_plan_not_found_view') AS not_found,
  COUNT(*) FILTER (WHERE feature_raw IN ('share_day_plan_cta_click', 'share_week_plan_cta_click')) AS cta_clicks
FROM analytics.usage_events_enriched
CROSS JOIN params p
WHERE event_timestamp >= p.from_utc
  AND event_timestamp < p.to_utc
  AND feature_raw IN (
    'shared_plan_view', 'shared_plan_not_found_view',
    'share_day_plan_cta_click', 'share_week_plan_cta_click'
  )
GROUP BY 1
ORDER BY views DESC;

-- Планы: был view по ref, не было CTA в окне (anon/session не различаем — ref-level proxy)
WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
views AS (
  SELECT DISTINCT prop_plan_ref AS ref
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'shared_plan_view'
    AND prop_plan_ref IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
ctas AS (
  SELECT DISTINCT prop_plan_ref AS ref
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw IN ('share_day_plan_cta_click', 'share_week_plan_cta_click')
    AND prop_plan_ref IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
)
SELECT
  (SELECT COUNT(*) FROM views) AS plan_refs_with_view,
  (SELECT COUNT(*) FROM views v WHERE NOT EXISTS (SELECT 1 FROM ctas c WHERE c.ref = v.ref))
    AS plan_refs_view_no_cta_in_window;

-- Shared plan → auth (anon stitch) → activation
WITH params AS (
  SELECT
    '2026-03-01 00:00:00+00'::timestamptz AS from_utc,
    '2026-04-01 00:00:00+00'::timestamptz AS to_utc
),
saw_plan AS (
  SELECT DISTINCT anon_id
  FROM analytics.usage_events_enriched
  CROSS JOIN params p
  WHERE feature_raw = 'shared_plan_view'
    AND anon_id IS NOT NULL
    AND event_timestamp >= p.from_utc
    AND event_timestamp < p.to_utc
),
authed AS (
  SELECT DISTINCT ue.user_id, ue.anon_id, ue.event_timestamp AS auth_at
  FROM analytics.usage_events_enriched ue
  CROSS JOIN params p
  INNER JOIN saw_plan sp ON sp.anon_id = ue.anon_id
  WHERE ue.feature_raw = 'auth_success'
    AND ue.user_id IS NOT NULL
    AND ue.event_timestamp >= p.from_utc
    AND ue.event_timestamp < p.to_utc
),
activated AS (
  SELECT DISTINCT a.user_id
  FROM authed a
  INNER JOIN analytics.usage_events_enriched ue ON ue.user_id = a.user_id
  CROSS JOIN params p
  WHERE ue.feature_raw IN (
      'chat_recipe', 'plan_fill_day', 'favorite_add',
      'plan_slot_replace_success', 'plan_fill_day_success', 'help', 'recipe_view'
    )
    AND ue.event_timestamp >= a.auth_at
    AND ue.event_timestamp < p.to_utc
)
SELECT
  (SELECT COUNT(*) FROM saw_plan) AS distinct_anon_shared_plan_view,
  (SELECT COUNT(DISTINCT user_id) FROM authed) AS distinct_users_auth_after_shared_plan_touch,
  (SELECT COUNT(*) FROM activated) AS distinct_users_activated_after_that_auth;
