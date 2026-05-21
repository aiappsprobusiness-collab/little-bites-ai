/**
 * Централизованная логика подписок: Free / Trial / Premium.
 * Вся проверка в приложении должна идти через эту утилиту.
 * Trial = 100% функционал Premium (3 дня). Free — ограничения.
 *
 * Монетизация карточек Help (free vs paid) — только в `src/data/sosTopics.ts` (`requiredTier`).
 * Суточные лимиты чата и Help — здесь и в `supabase/functions/_shared/subscriptionLimits.ts`.
 */

/** Длительность trial при активации по кнопке (см. миграции profiles_v2.trial_until). */
export const TRIAL_DURATION_DAYS = 3;

/** Суточный лимит генераций рецепта в чате для Premium/Trial (скрытый продуктовый лимит). */
export const PREMIUM_TRIAL_CHAT_DAILY_LIMIT = 20;
/** Суточный лимит запросов «Помощь маме» для Premium/Trial. */
export const PREMIUM_TRIAL_HELP_DAILY_LIMIT = 20;

/** Free: замен блюда в плане из пула за сутки (локальный счётчик на клиенте). */
export const FREE_MEAL_SWAP_PER_DAY = 2;

export type SubscriptionTier = "free" | "trial" | "premium";

export interface SubscriptionLimitsConfig {
  /** Максимум профилей членов семьи (создание). */
  maxProfiles: number;
  maxActiveProfiles: number;
  maxAllergiesPerProfile: number;
  /** Макс. тегов «любит» на профиль (Premium/Trial). */
  maxLikesTagsPerProfile: number;
  /** Макс. тегов «не любит» на профиль (Premium/Trial). */
  maxDislikesTagsPerProfile: number;
  preferencesEnabled: boolean;
  /**
   * Макс. успешных генераций рецепта в чате за сутки (UTC), счётчик — usage_events.feature = chat_recipe.
   * null только для внутренних исключений; у тарифов задано явное число.
   */
  aiDailyLimit: number | null;
  /** Лимит запросов help за сутки (UTC), счётчик — usage_events.feature = help. */
  helpDailyLimit: number | null;
}

export const SUBSCRIPTION_LIMITS: {
  free: SubscriptionLimitsConfig;
  paid: SubscriptionLimitsConfig;
} = {
  free: {
    maxProfiles: 1,
    maxActiveProfiles: 1,
    maxAllergiesPerProfile: 1,
    maxLikesTagsPerProfile: 0,
    maxDislikesTagsPerProfile: 0,
    preferencesEnabled: false,
    aiDailyLimit: 5,
    helpDailyLimit: 2,
  },
  paid: {
    maxProfiles: 7,
    maxActiveProfiles: 7,
    maxAllergiesPerProfile: 7,
    maxLikesTagsPerProfile: 5,
    maxDislikesTagsPerProfile: 5,
    preferencesEnabled: true,
    aiDailyLimit: PREMIUM_TRIAL_CHAT_DAILY_LIMIT,
    helpDailyLimit: PREMIUM_TRIAL_HELP_DAILY_LIMIT,
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
