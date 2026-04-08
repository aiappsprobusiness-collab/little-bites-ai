/**
 * Онбординг после активации trial (единый источник текстов для модалки).
 */

import { TRIAL_DURATION_DAYS } from "@/utils/subscriptionRules";

export const TRIAL_ONBOARDING_TITLE = "🎉 Мы открыли вам полный доступ на 3 дня";

export const TRIAL_ONBOARDING_INTRO = `Теперь вам доступны:`;

export const TRIAL_ONBOARDING_BULLETS = [
  'Общий профиль "Семья"',
  "Автозамена или ручное назначение блюд",
  "Список продуктов из плана питания/рецепта",
  "Недельный план питания",
  'Все разделы вкладки «Помощь маме»',
] as const;

export function trialOnboardingFooterPhrase(days: number = TRIAL_DURATION_DAYS): string {
  return `Через ${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"} вы вернётесь к бесплатной версии`;
}

export const TRIAL_ONBOARDING_CTA_CONTINUE = "Продолжить";

export const TRIAL_ONBOARDING_CTA_PRICING = "Чем отличается полная версия";
