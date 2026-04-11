/**
 * Проверка релевантности запроса для чата рецептов.
 * Реализация делегирует в `recipeChatIntent.ts` (weighted scoring + margin).
 */
import { resolveRecipeChatIntent } from "./recipeChatIntent.ts";

export type RelevanceResult = {
  allowed: boolean;
  reason: string;
  matchedTerms: string[];
  matchedPatterns: string[];
  clearlyNonFood: boolean;
};

/**
 * Совместимость с логами: allow/reject по результату `resolveRecipeChatIntent`.
 */
export function checkFoodRelevance(text: string): RelevanceResult {
  const intent = resolveRecipeChatIntent(text);
  if (intent.route === "irrelevant") {
    const clearly =
      intent.reason.startsWith("offtopic") ||
      intent.reason === "too_short" ||
      intent.reason === "no_vowels";
    return {
      allowed: false,
      reason: intent.reason,
      matchedTerms: [],
      matchedPatterns: [],
      clearlyNonFood: clearly,
    };
  }
  return {
    allowed: true,
    reason: intent.reason,
    matchedTerms: [],
    matchedPatterns: [],
    clearlyNonFood: false,
  };
}

/** FREE: совместимость с прежним API — только allow/reject по checkFoodRelevance */
export function isRelevantQuery(text: string): boolean {
  return checkFoodRelevance(text).allowed;
}

/** PREMIUM: то же правило, оба пути (true/"soft") ведут в генерацию — возвращаем только true/false */
export function isRelevantPremiumQuery(text: string): false | "soft" | true {
  const result = checkFoodRelevance(text);
  return result.allowed ? true : false;
}
