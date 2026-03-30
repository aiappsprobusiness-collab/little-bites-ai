/**
 * Зеркало `supabase/functions/_shared/trackUsageClientPolicy.ts`.
 * При изменении списка — обновить оба файла.
 */
export const CLIENT_FORBIDDEN_USAGE_EVENT_FEATURES = [
  "chat_recipe",
  "help",
  "plan_fill_day",
  "plan_refresh",
] as const;

export function isClientForbiddenUsageFeature(feature: string): boolean {
  const f = feature.trim();
  return (CLIENT_FORBIDDEN_USAGE_EVENT_FEATURES as readonly string[]).includes(f);
}
