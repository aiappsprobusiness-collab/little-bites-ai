-- Просмотр лайт-страницы регистрации после Telegram-бота: `tg_start_page_view` → auth / view в analytics.usage_events_enriched.

DROP VIEW IF EXISTS analytics.usage_events_enriched CASCADE;

CREATE VIEW analytics.usage_events_enriched AS
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
    WHEN 'tg_start_page_view' THEN 'auth'
    WHEN 'auth_start' THEN 'auth'
    WHEN 'cta_start_click' THEN 'auth'
    WHEN 'auth_success' THEN 'auth'
    WHEN 'auth_error' THEN 'auth'
    WHEN 'member_create_start' THEN 'onboarding'
    WHEN 'member_create_success' THEN 'onboarding'
    WHEN 'paywall_view' THEN 'paywall'
    WHEN 'paywall_primary_click' THEN 'paywall'
    WHEN 'paywall_secondary_click' THEN 'paywall'
    WHEN 'paywall_replace_meal_shown' THEN 'paywall'
    WHEN 'trial_started_from_replace_meal' THEN 'paywall'
    WHEN 'paywall_closed_replace_meal' THEN 'paywall'
    WHEN 'pricing_info_opened' THEN 'paywall'
    WHEN 'trial_onboarding_shown' THEN 'onboarding'
    WHEN 'trial_onboarding_closed' THEN 'onboarding'
    WHEN 'trial_started' THEN 'paywall'
    WHEN 'purchase_start' THEN 'subscription_client'
    WHEN 'purchase_success' THEN 'subscription_client'
    WHEN 'purchase_error' THEN 'subscription_client'
    WHEN 'plan_view_day' THEN 'meal_plan'
    WHEN 'plan_fill_day_click' THEN 'meal_plan'
    WHEN 'plan_fill_day_success' THEN 'meal_plan'
    WHEN 'plan_fill_day_error' THEN 'meal_plan'
    WHEN 'plan_fill_day' THEN 'meal_plan'
    WHEN 'plan_slot_replace_attempt' THEN 'meal_plan'
    WHEN 'plan_slot_replace_success' THEN 'meal_plan'
    WHEN 'plan_slot_replace_fail' THEN 'meal_plan'
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
    WHEN 'share_link_created' THEN 'share'
    WHEN 'shared_plan_view' THEN 'share'
    WHEN 'shared_plan_not_found_view' THEN 'share'
    WHEN 'share_recipe_cta_click' THEN 'share'
    WHEN 'share_day_plan_cta_click' THEN 'share'
    WHEN 'share_week_plan_cta_click' THEN 'share'
    WHEN 'recipe_view' THEN 'recipes'
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
      'landing_view', 'prelogin_view', 'landing_demo_open', 'auth_page_view', 'tg_start_page_view', 'plan_view_day',
      'chat_open', 'help_open', 'paywall_view', 'share_landing_view', 'shared_plan_view',
      'shared_plan_not_found_view', 'ad_rewarded_shown', 'help_topic_open', 'recipe_view',
      'paywall_replace_meal_shown', 'trial_onboarding_shown', 'pricing_info_opened'
    ) THEN 'view'
    WHEN ue.feature IN (
      'landing_demo_save_click', 'landing_cta_free_click', 'landing_cta_login_click', 'prelogin_cta_click',
      'auth_start', 'cta_start_click', 'member_create_start', 'paywall_primary_click', 'paywall_secondary_click',
      'purchase_start', 'plan_fill_day_click', 'partial_week_toast_favorites_click', 'partial_week_toast_assistant_click',
      'chat_generate_click', 'share_click', 'share_recipe_cta_click', 'share_day_plan_cta_click', 'share_week_plan_cta_click',
      'plan_slot_replace_attempt', 'paywall_closed_replace_meal', 'trial_onboarding_closed'
    ) THEN 'click'
    WHEN ue.feature IN ('chat_recipe', 'help', 'plan_fill_day') THEN 'server_quota'
    WHEN ue.feature IN ('premium_chat_limit_reached', 'premium_help_limit_reached') THEN 'limit_ui'
    WHEN ue.feature IN (
      'auth_success', 'auth_error', 'trial_started', 'trial_started_from_replace_meal', 'purchase_success', 'purchase_error',
      'chat_generate_success', 'chat_generate_error', 'plan_fill_day_success', 'plan_fill_day_error',
      'help_answer_received', 'member_create_success',
      'plan_slot_replace_success', 'plan_slot_replace_fail',
      'favorite_add', 'favorite_remove', 'ad_rewarded_dismissed', 'ad_rewarded_completed',
      'share_link_created'
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
  ue.properties ->> 'share_type' AS prop_share_type,
  ue.properties ->> 'entry_point' AS prop_entry_point,
  ue.properties #>> '{onboarding,first_landing_path}' AS onboarding_first_landing_path,
  ue.properties #>> '{onboarding,onboarding_entry_point}' AS onboarding_entry_point,
  (ue.user_id IS NOT NULL) AS is_authenticated,
  ue.properties ->> 'platform' AS platform
FROM public.usage_events ue;

COMMENT ON VIEW analytics.usage_events_enriched IS
  'Обогащённые usage_events: event_group, event_type, jsonb properties как плоские поля. Вкл. tg_start_page_view (Telegram /tg-start).';

GRANT USAGE ON SCHEMA analytics TO authenticated, service_role;
GRANT SELECT ON analytics.usage_events_enriched TO authenticated, service_role;
