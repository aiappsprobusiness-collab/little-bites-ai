/**
 * Безопасная обёртка для событий аналитики landing/prelogin/share.
 * Не бросает исключений, чтобы не ломать UI.
 */

import { trackUsageEvent } from "@/utils/usageEvents";

export function trackLandingEvent(
  feature: string,
  properties?: Record<string, unknown>
): void {
  try {
    trackUsageEvent(feature, properties ? { properties } : {});
  } catch {
    /* safe: не ломаем UI */
  }
}

export const landingEvents = {
  landing_view: () => trackLandingEvent("landing_view"),
  landing_demo_open: () => trackLandingEvent("landing_demo_open"),
  landing_demo_save_click: () => trackLandingEvent("landing_demo_save_click"),
  landing_cta_free_click: () => trackLandingEvent("landing_cta_free_click"),
  prelogin_view: () => trackLandingEvent("prelogin_view"),
  share_recipe_cta_click: () => trackLandingEvent("share_recipe_cta_click"),
  share_day_plan_cta_click: () => trackLandingEvent("share_day_plan_cta_click"),
  share_week_plan_cta_click: () => trackLandingEvent("share_week_plan_cta_click"),
} as const;
