/**
 * События показа paywall-/trial-текстов для `analytics.usage_events_enriched`
 * (`feature = paywall_text`, в properties — `paywall_reason` → колонка `prop_paywall_reason`).
 */
import { trackUsageEvent } from "@/utils/usageEvents";

export type PaywallTextSurface =
  | "unified_paywall"
  | "legacy_paywall"
  | "replace_meal_soft"
  | "trial_onboarding"
  | "trial_lifecycle"
  | "free_vs_premium"
  | "week_preview_sheet"
  | "limit_reached_banner"
  | "friendly_limit_dialog"
  | "favorites_limit_sheet"
  | "topic_consultation"
  | "meal_plan"
  | "chat"
  | "sos_hero"
  | "pool_exhausted"
  | "shopping_list_sheet"
  | "recipe_page"
  | "profile"
  | "subscription_manage"
  | "payment_result"
  | "landing_example_recipe"
  | "other";

/**
 * @param paywallReasonKey — стабильный ключ копирайта (например `unified_main`, `week_locked`, или канонический `paywall_reason`).
 */
export function trackPaywallTextShown(
  paywallReasonKey: string,
  options?: {
    memberId?: string | null;
    surface?: PaywallTextSurface;
    /** Доп. поля в `properties` (например `entry_point` для лендинга). */
    properties?: Record<string, unknown>;
  }
): void {
  if (!paywallReasonKey) return;
  trackUsageEvent("paywall_text", {
    memberId: options?.memberId ?? null,
    properties: {
      paywall_reason: paywallReasonKey,
      ...(options?.surface ? { surface: options.surface } : {}),
      ...(options?.properties ?? {}),
    },
  });
}
