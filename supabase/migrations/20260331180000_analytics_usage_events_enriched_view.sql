-- Stage 3: read-only product analytics layer — enriched view over usage_events.
-- Синхронизировать CASE с docs/decisions/ANALYTICS_EVENT_TAXONOMY_STAGE2.md при добавлении feature.

CREATE SCHEMA IF NOT EXISTS analytics;

COMMENT ON SCHEMA analytics IS 'Read-only views для продуктовой аналитики; не хранит данные. Новые feature — обновлять usage_events_enriched.';

CREATE OR REPLACE VIEW analytics.usage_events_enriched AS
SELECT
  ue.id,
  ue.created_at AS event_timestamp,
  (ue.created_at AT TIME ZONE 'UTC')::date AS event_date_utc,
  ue.feature AS feature_raw,
  ue.feature AS canonical_feature,
  CASE ue.feature
    WHEN 'landing_view' THEN 'acquisition'
    WHEN 'prelogin_view' THEN 'acquisition'
    WHEN 'landing_demo_open' THEN 'acquisition'
    WHEN 'landing_demo_save_click' THEN 'acquisition'
    WHEN 'landing_cta_free_click' THEN 'acquisition'
    WHEN 'landing_cta_login_click' THEN 'acquisition'
    WHEN 'prelogin_cta_click' THEN 'acquisition'
    WHEN 'auth_page_view' THEN 'auth'
    WHEN 'auth_start' THEN 'auth'
    WHEN 'cta_start_click' THEN 'auth'
    WHEN 'auth_success' THEN 'auth'
    WHEN 'auth_error' THEN 'auth'
    WHEN 'member_create_start' THEN 'onboarding'
    WHEN 'member_create_success' THEN 'onboarding'
    WHEN 'paywall_view' THEN 'paywall'
    WHEN 'paywall_primary_click' THEN 'paywall'
    WHEN 'paywall_secondary_click' THEN 'paywall'
    WHEN 'trial_started' THEN 'paywall'
    WHEN 'purchase_start' THEN 'subscription_client'
    WHEN 'purchase_success' THEN 'subscription_client'
    WHEN 'purchase_error' THEN 'subscription_client'
    WHEN 'plan_view_day' THEN 'meal_plan'
    WHEN 'plan_fill_day_click' THEN 'meal_plan'
    WHEN 'plan_fill_day_success' THEN 'meal_plan'
    WHEN 'plan_fill_day_error' THEN 'meal_plan'
    WHEN 'plan_fill_day' THEN 'meal_plan'
    WHEN 'plan_slot_replace_success' THEN 'meal_plan'
    WHEN 'partial_week_toast_favorites_click' THEN 'meal_plan'
    WHEN 'partial_week_toast_assistant_click' THEN 'meal_plan'
    WHEN 'chat_open' THEN 'chat'
    WHEN 'chat_generate_click' THEN 'chat'
    WHEN 'chat_generate_success' THEN 'chat'
    WHEN 'chat_generate_error' THEN 'chat'
    WHEN 'chat_recipe' THEN 'chat'
    WHEN 'help_open' THEN 'help'
    WHEN 'help_topic_open' THEN 'help'
    WHEN 'help_answer_received' THEN 'help'
    WHEN 'help' THEN 'help'
    WHEN 'share_landing_view' THEN 'share'
    WHEN 'share_click' THEN 'share'
    WHEN 'shared_plan_view' THEN 'share'
    WHEN 'shared_plan_not_found_view' THEN 'share'
    WHEN 'share_recipe_cta_click' THEN 'share'
    WHEN 'share_day_plan_cta_click' THEN 'share'
    WHEN 'share_week_plan_cta_click' THEN 'share'
    WHEN 'favorite_add' THEN 'favorites'
    WHEN 'favorite_remove' THEN 'favorites'
    WHEN 'ad_rewarded_shown' THEN 'ads'
    WHEN 'ad_rewarded_dismissed' THEN 'ads'
    WHEN 'ad_rewarded_completed' THEN 'ads'
    WHEN 'premium_chat_limit_reached' THEN 'limits_ui'
    WHEN 'premium_help_limit_reached' THEN 'limits_ui'
    ELSE 'unknown'
  END AS event_group,
  CASE
    WHEN ue.feature IN (
      'landing_view', 'prelogin_view', 'landing_demo_open', 'auth_page_view', 'plan_view_day',
      'chat_open', 'help_open', 'paywall_view', 'share_landing_view', 'shared_plan_view',
      'shared_plan_not_found_view', 'ad_rewarded_shown', 'help_topic_open'
    ) THEN 'view'
    WHEN ue.feature IN (
      'landing_demo_save_click', 'landing_cta_free_click', 'landing_cta_login_click', 'prelogin_cta_click',
      'auth_start', 'cta_start_click', 'member_create_start', 'paywall_primary_click', 'paywall_secondary_click',
      'purchase_start', 'plan_fill_day_click', 'partial_week_toast_favorites_click', 'partial_week_toast_assistant_click',
      'chat_generate_click', 'share_click', 'share_recipe_cta_click', 'share_day_plan_cta_click', 'share_week_plan_cta_click'
    ) THEN 'click'
    WHEN ue.feature IN ('chat_recipe', 'help', 'plan_fill_day') THEN 'server_quota'
    WHEN ue.feature IN ('premium_chat_limit_reached', 'premium_help_limit_reached') THEN 'limit_ui'
    WHEN ue.feature IN (
      'auth_success', 'auth_error', 'trial_started', 'purchase_success', 'purchase_error',
      'chat_generate_success', 'chat_generate_error', 'plan_fill_day_success', 'plan_fill_day_error',
      'help_answer_received', 'member_create_success',
      'plan_slot_replace_success',
      'favorite_add', 'favorite_remove', 'ad_rewarded_dismissed', 'ad_rewarded_completed'
    ) THEN 'outcome'
    ELSE 'other'
  END AS event_type,
  ue.user_id,
  ue.anon_id,
  ue.session_id,
  ue.member_id,
  ue.page,
  ue.entry_point,
  ue.utm_source,
  ue.utm_medium,
  ue.utm_campaign,
  ue.utm_content,
  ue.utm_term,
  ue.properties,
  ue.properties -> 'onboarding' AS onboarding_json,
  ue.properties ->> 'recipe_id' AS prop_recipe_id,
  ue.properties ->> 'share_ref' AS prop_share_ref,
  ue.properties ->> 'plan_ref' AS prop_plan_ref,
  ue.properties ->> 'paywall_reason' AS prop_paywall_reason,
  ue.properties ->> 'source' AS prop_source,
  ue.properties ->> 'target' AS prop_cta_target,
  ue.properties ->> 'plan_scope' AS prop_plan_scope,
  ue.properties ->> 'plan_source' AS prop_plan_source,
  ue.properties #>> '{onboarding,first_landing_path}' AS onboarding_first_landing_path,
  ue.properties #>> '{onboarding,onboarding_entry_point}' AS onboarding_entry_point,
  (ue.user_id IS NOT NULL) AS is_authenticated,
  NULL::text AS platform
FROM public.usage_events ue;

COMMENT ON VIEW analytics.usage_events_enriched IS
  'Обогащённые usage_events: event_group, event_type, jsonb properties как плоские поля. platform не собирается в приложении (всегда NULL). Неизвестные feature → event_group unknown, event_type other.';

GRANT USAGE ON SCHEMA analytics TO authenticated, service_role;
GRANT SELECT ON analytics.usage_events_enriched TO authenticated, service_role;
