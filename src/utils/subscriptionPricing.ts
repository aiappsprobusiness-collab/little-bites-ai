/**
 * Единый source of truth для отображаемых цен подписки (₽).
 * Суммы в копейках для Т-Банка должны совпадать с
 * `supabase/functions/_shared/subscriptionPricing.json` (create-payment, payment-webhook).
 */
export const SUBSCRIPTION_PRICES = {
  monthly: 299,
  yearly: 1999,
} as const;

/** Эквивалент в месяц при оплате за год (для подзаголовка). */
export const YEARLY_PER_MONTH = Math.floor(SUBSCRIPTION_PRICES.yearly / 12);

/** Текст под годовым тарифом (психология выгоды). */
export const YEARLY_SAVINGS_COPY =
  "Экономия ~45% по сравнению с помесячной оплатой";

/** Бейдж на годовом плане, когда выбран другой вариант. */
export const YEARLY_BADGE_WHEN_NOT_SELECTED = "Выгодно ~45%";

export type SubscriptionPlanKey = "month" | "year";

/** Сумма в копейках для Init / сверки webhook. */
export function subscriptionAmountKopecks(plan: SubscriptionPlanKey): number {
  return plan === "year" ? SUBSCRIPTION_PRICES.yearly * 100 : SUBSCRIPTION_PRICES.monthly * 100;
}

export function paywallSubscribeCtaLabel(plan: SubscriptionPlanKey): string {
  return plan === "year"
    ? `Оформить за ${SUBSCRIPTION_PRICES.yearly.toLocaleString("ru-RU")} ₽ в год`
    : `Оформить за ${SUBSCRIPTION_PRICES.monthly.toLocaleString("ru-RU")} ₽ в месяц`;
}
