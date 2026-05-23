import type { A2HSTriggerSource } from "@/utils/a2hsTypes";
import { useAppStore } from "@/store/useAppStore";

/** Длительность тоста «План на день/неделю готов» на MealPlanPage. */
export const PLAN_READY_TOAST_DURATION_MS = 5_000;

/** Пауза после исчезновения тоста, перед модалкой установки. */
export const A2HS_GAP_AFTER_PLAN_TOAST_MS = 800;

/** Задержка перед первой попыткой показа A2HS после готовности плана (день/неделя). */
export const A2HS_DELAY_AFTER_PLAN_READY_MS =
  PLAN_READY_TOAST_DURATION_MS + A2HS_GAP_AFTER_PLAN_TOAST_MS;

/** Рецепт в чате: без тоста плана, короче задержка. */
export const A2HS_DELAY_AFTER_RECIPE_MS = 4_000;

/** Повтор, если поверх открыт trial/paywall. */
export const A2HS_BLOCKED_RETRY_MS = 1_500;

export const A2HS_BLOCKED_MAX_RETRIES = 12;

export function getA2HSDelayMs(trigger: A2HSTriggerSource): number {
  switch (trigger) {
    case "day":
    case "week":
    case "plan":
      return A2HS_DELAY_AFTER_PLAN_READY_MS;
    case "recipe":
      return A2HS_DELAY_AFTER_RECIPE_MS;
    default:
      return A2HS_DELAY_AFTER_PLAN_READY_MS;
  }
}

/** Модалки/оверлеи, с которыми не показываем установку одновременно. */
export function isA2HSBlockedByOverlay(): boolean {
  const s = useAppStore.getState();
  return (
    s.showPaywall ||
    s.showPostValueTrialPrompt ||
    s.showTrialActivatedModal ||
    s.showFreeVsPremiumModal ||
    s.showFavoritesLimitSheet
  );
}
