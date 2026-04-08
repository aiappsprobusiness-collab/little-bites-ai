/**
 * Онбординг после активации trial (единый источник текстов для модалки).
 */

import { TRIAL_DURATION_DAYS } from "@/utils/subscriptionRules";

export const TRIAL_ONBOARDING_TITLE = "🎉 Теперь можно выдохнуть";

export const TRIAL_ONBOARDING_INTRO = "Мы открыли вам полный доступ на 3 дня. Теперь вы можете:";

export const TRIAL_ONBOARDING_BULLETS = [
  "быстро менять блюда",
  "не думать каждый день, что приготовить",
  "задавать любые вопросы по питанию",
  "пользоваться всеми функциями без ограничений",
] as const;

export function trialOnboardingFooterPhrase(days: number = TRIAL_DURATION_DAYS): string {
  return `Через ${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"} вернётся бесплатная версия`;
}

export const TRIAL_ONBOARDING_CTA_CONTINUE = "Продолжить";

export const TRIAL_ONBOARDING_CTA_PRICING = "Чем отличается полная версия";
