/**
 * Централизованная логика подписок: Free / Trial / Premium.
 * Вся проверка в приложении должна идти через эту утилиту.
 * Trial = 100% функционал Premium (3 дня). Free — ограничения.
 */

export type SubscriptionTier = "free" | "trial" | "premium";

export interface SubscriptionLimitsConfig {
  maxProfiles: number;
  maxActiveProfiles: number;
  maxAllergiesPerProfile: number;
  preferencesEnabled: boolean;
  helpUnlockedBlocks: number;
  /** null = лимит отсутствует (безлимит). number = макс. AI-запросов в день. */
  aiDailyLimit: number | null;
}

export const SUBSCRIPTION_LIMITS: {
  free: SubscriptionLimitsConfig;
  paid: SubscriptionLimitsConfig;
} = {
  free: {
    maxProfiles: 10,
    maxActiveProfiles: 1,
    maxAllergiesPerProfile: 1,
    preferencesEnabled: false,
    helpUnlockedBlocks: 3,
    aiDailyLimit: 2,
  },
  paid: {
    maxProfiles: 10,
    maxActiveProfiles: 10,
    maxAllergiesPerProfile: 10,
    preferencesEnabled: true,
    helpUnlockedBlocks: 8,
    aiDailyLimit: null,
  },
};

/** Проверка: исчерпан ли дневной лимит AI. limit === null → лимита нет (не исчерпан). */
export function isAiDailyLimitExceeded(used: number, limit: number | null): boolean {
  return limit !== null && used >= limit;
}

/** Пользователь — объект с эффективным статусом (например из useSubscription). */
export interface SubscriptionUser {
  subscriptionStatus: SubscriptionTier;
}

export function isFree(user: SubscriptionUser | SubscriptionTier): boolean {
  const tier = typeof user === "string" ? user : user.subscriptionStatus;
  return tier === "free";
}

export function isTrial(user: SubscriptionUser | SubscriptionTier): boolean {
  const tier = typeof user === "string" ? user : user.subscriptionStatus;
  return tier === "trial";
}

export function isPremium(user: SubscriptionUser | SubscriptionTier): boolean {
  const tier = typeof user === "string" ? user : user.subscriptionStatus;
  return tier === "premium";
}

/** trial || premium */
export function isPaid(user: SubscriptionUser | SubscriptionTier): boolean {
  const tier = typeof user === "string" ? user : user.subscriptionStatus;
  return tier === "trial" || tier === "premium";
}

/** Лимиты по тарифу: free → SUBSCRIPTION_LIMITS.free, trial/premium → paid. */
export function getSubscriptionLimits(
  user: SubscriptionUser | SubscriptionTier
): SubscriptionLimitsConfig {
  return isFree(user) ? SUBSCRIPTION_LIMITS.free : SUBSCRIPTION_LIMITS.paid;
}
