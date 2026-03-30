/**
 * Грубая платформа для usage_events.properties.platform (Stage 5).
 * Нативные приложения — через Capacitor; PWA — standalone display-mode (см. standalone.ts);
 * иначе web. Не пытаемся отличить «вкладка Chrome» от «установленной PWA без standalone».
 */

import { Capacitor } from "@capacitor/core";
import { isStandalone } from "@/utils/standalone";

export type AnalyticsPlatform = "web" | "pwa" | "ios" | "android" | "unknown";

export function getAnalyticsPlatform(): AnalyticsPlatform {
  if (typeof window === "undefined") return "unknown";
  try {
    if (Capacitor.isNativePlatform()) {
      const p = Capacitor.getPlatform();
      if (p === "ios") return "ios";
      if (p === "android") return "android";
      return "unknown";
    }
  } catch {
    /* без нативного рантайма */
  }
  if (isStandalone()) return "pwa";
  return "web";
}
