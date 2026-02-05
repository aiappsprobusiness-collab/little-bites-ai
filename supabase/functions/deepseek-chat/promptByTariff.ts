/**
 * v2: Free vs Premium/Trial — сборка опций промпта и лимитов на основе profiles.status.
 * Free: 1 профиль, 1 аллергия макс, ~700 токенов, строгая структура.
 * Premium/Trial: все аллергии, эмпатичный тон, советы шефа, ~1500 токенов.
 * Для type "family" — явно балансировать интересы всех members.
 */

export type ProfileStatus = "free" | "premium" | "trial";

export interface PromptByTariffOptions {
  /** status из profiles (v2) или subscription_status (legacy) */
  status: ProfileStatus | string;
  /** тип выбранного member: "family" → добавить familyBalanceNote */
  memberType?: "child" | "adult" | "family";
  /** есть ли несколько members (для семьи) */
  isFamilyTarget?: boolean;
}

export interface PromptByTariffResult {
  /** Дополнительные строки для system prompt (age rules уже в ageCategory; здесь — тариф) */
  tariffAppendix: string;
  /** Лимит токенов ответа: free ~700, premium/trial ~1500 */
  maxTokens: number;
  /** Учитывать все аллергии (free: макс 1, premium: все) */
  useAllAllergies: boolean;
  /** Строка для промпта: баланс интересов семьи (если memberType === "family" или isFamilyTarget) */
  familyBalanceNote: string;
}

const FREE_MAX_TOKENS = 1200;
const PREMIUM_MAX_TOKENS = 2500;

/** Собирает опции промпта на основе профиля и тарифа. */
export function buildPromptByProfileAndTariff(
  options: PromptByTariffOptions
): PromptByTariffResult {
  const isPremiumOrTrial =
    options.status === "premium" || options.status === "trial";
  const isFamily =
    options.memberType === "family" || options.isFamilyTarget === true;

  return {
    tariffAppendix: isPremiumOrTrial
      ? "Эмпатичный тон, советы шефа. Учитывай все аллергии."
      : "Строгая структура: Название, 5–7 ингредиентов, 5–7 шагов, без длинных объяснений + один совет по блюду.",
    maxTokens: isPremiumOrTrial ? PREMIUM_MAX_TOKENS : FREE_MAX_TOKENS,
    useAllAllergies: isPremiumOrTrial,
    familyBalanceNote: isFamily
      ? "Балансируй интересы всех членов семьи (разный возраст и аллергии)."
      : "",
  };
}
