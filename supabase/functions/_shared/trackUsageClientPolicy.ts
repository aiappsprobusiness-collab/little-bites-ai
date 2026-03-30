/**
 * Политика имён feature для Edge track-usage-event.
 * Синхронизировать с `src/utils/trackUsageClientPolicy.ts` при изменениях.
 *
 * События, участвующие в get_usage_count_today (лимиты Free / Premium-Trial),
 * должны записываться только из Edge (deepseek-chat, generate-plan), не с клиента.
 */
export const CLIENT_FORBIDDEN_USAGE_EVENT_FEATURES = [
  "chat_recipe",
  "help",
  "plan_fill_day",
  "plan_refresh",
] as const;

export type ClientForbiddenUsageEventFeature = (typeof CLIENT_FORBIDDEN_USAGE_EVENT_FEATURES)[number];

export function isClientForbiddenUsageFeature(feature: string): boolean {
  const f = feature.trim();
  return (CLIENT_FORBIDDEN_USAGE_EVENT_FEATURES as readonly string[]).includes(f);
}
