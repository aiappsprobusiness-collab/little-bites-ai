-- =============================================================================
-- Когорты по onboarding-атрибуции (Stage 4)
-- =============================================================================
-- Данные: properties.onboarding в usage_events (прокидывается на событиях после
-- сохранения onboarding_attribution в localStorage). Во view: onboarding_json,
-- onboarding_first_landing_path, onboarding_entry_point; дополнительно в SQL —
-- properties #>> '{onboarding,source}' как proxy «канала» (часто совпадает с utm source).
--
-- Берём ПЕРВОЕ событие auth_success с непустым onboarding_json (или source) для user_id
-- и группируем по COALESCE(onboarding.source, '(no_source)').
--
-- GAP: если пользователь залогинился до того как onboarding попал в события — bucket skew.
-- GAP: не все клиенты передают onboarding на каждом событии — первый богатый auth_success
--      может быть не самым ранним (редко).
-- =============================================================================

WITH params AS (
  SELECT
    '2026-01-01'::date AS cohort_from,
    '2026-04-01'::date AS cohort_to,
    '2026-04-15'::timestamptz AS data_through_ts
),
cohort AS (
  SELECT DISTINCT ON (ue.user_id)
    ue.user_id,
    ue.event_timestamp AS auth_at,
    NULLIF(trim(ue.properties #>> '{onboarding,source}'), '') AS ob_source,
    NULLIF(trim(ue.onboarding_entry_point), '') AS ob_entry,
    ue.onboarding_first_landing_path
  FROM analytics.usage_events_enriched ue
  CROSS JOIN params p
  WHERE ue.feature_raw = 'auth_success'
    AND ue.user_id IS NOT NULL
    AND (ue.event_timestamp AT TIME ZONE 'UTC')::date >= p.cohort_from
    AND (ue.event_timestamp AT TIME ZONE 'UTC')::date < p.cohort_to
    AND ue.onboarding_json IS NOT NULL
    AND ue.onboarding_json::text NOT IN ('null', '{}')
  ORDER BY ue.user_id, ue.event_timestamp ASC
),
activation AS (
  SELECT DISTINCT c.user_id
  FROM cohort c
  INNER JOIN analytics.usage_events_enriched ue ON ue.user_id = c.user_id
  CROSS JOIN params p
  WHERE ue.feature_raw IN (
      'chat_recipe', 'plan_fill_day', 'favorite_add',
      'plan_slot_replace_success', 'plan_fill_day_success', 'help', 'recipe_view'
    )
    AND ue.event_timestamp >= c.auth_at
    AND ue.event_timestamp <= p.data_through_ts
),
paywall AS (
  SELECT DISTINCT c.user_id
  FROM cohort c
  INNER JOIN analytics.usage_events_enriched ue ON ue.user_id = c.user_id
  CROSS JOIN params p
  WHERE ue.feature_raw = 'paywall_view'
    AND ue.event_timestamp >= c.auth_at
    AND ue.event_timestamp <= p.data_through_ts
),
purchase AS (
  SELECT DISTINCT c.user_id
  FROM cohort c
  INNER JOIN public.subscription_plan_audit spa ON spa.user_id = c.user_id
  CROSS JOIN params p
  WHERE spa.created_at <= p.data_through_ts
)
SELECT
  COALESCE(c.ob_source, '(no_onboarding_source)') AS cohort_onboarding_source,
  COUNT(*) AS users_with_onboarding_on_auth,
  COUNT(*) FILTER (WHERE a.user_id IS NOT NULL) AS activated,
  ROUND(100.0 * COUNT(*) FILTER (WHERE a.user_id IS NOT NULL) / NULLIF(COUNT(*), 0), 2)
    AS activation_rate_pct,
  COUNT(*) FILTER (WHERE pw.user_id IS NOT NULL) AS paywall_reach,
  ROUND(100.0 * COUNT(*) FILTER (WHERE pw.user_id IS NOT NULL) / NULLIF(COUNT(*), 0), 2)
    AS paywall_reach_pct,
  COUNT(*) FILTER (WHERE pu.user_id IS NOT NULL) AS purchase_reach,
  ROUND(100.0 * COUNT(*) FILTER (WHERE pu.user_id IS NOT NULL) / NULLIF(COUNT(*), 0), 2)
    AS purchase_reach_pct
FROM cohort c
LEFT JOIN activation a ON a.user_id = c.user_id
LEFT JOIN paywall pw ON pw.user_id = c.user_id
LEFT JOIN purchase pu ON pu.user_id = c.user_id
GROUP BY 1
ORDER BY users_with_onboarding_on_auth DESC;
