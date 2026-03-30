/**
 * Безопасная обёртка для событий аналитики landing/prelogin/share.
 * Не бросает исключений, чтобы не ломать UI.
 *
 * Справочник имён feature: docs/decisions/ANALYTICS_EVENT_TAXONOMY_STAGE2.md
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
