/**
 * Жёсткое правило аллергий для ЧАТА.
 * Проверка по подстрокам/токенам (как в плане): «ореховый пудинг» при аллергии на орехи → отказ, без подмены рецепта.
 */

import {
  buildBlockedTokens,
  getBlockedTokensPerAllergy,
  containsAnyToken,
} from "@/utils/allergenTokens";

export interface ChatAllergyCheckResult {
  blocked: boolean;
  found: string[];
  /** Текст для подстановки в сообщение отказа (имя аллергена). */
  displayAllergens?: string[];
}

/**
 * Проверяет, есть ли в тексте запроса подстрока-токен из списка аллергий (расширенный словарь: курица→кур/куриц, орехи→орех и т.д.).
 * Не подменяем ключевой ингредиент: если запрос явно про аллерген — отказ.
 */
export function checkChatAllergyBlock(
  userMessage: string,
  allergies: string[] | null | undefined
): ChatAllergyCheckResult {
  const list = (allergies || []).filter((a) => typeof a === "string" && (a as string).trim().length > 0);
  if (list.length === 0) {
    return { blocked: false, found: [] };
  }

  const messageLower = (userMessage || "").trim().toLowerCase();
  const blockedTokens = buildBlockedTokens(list);
  if (blockedTokens.length === 0) return { blocked: false, found: [] };

  if (!containsAnyToken(messageLower, blockedTokens).hit) {
    return { blocked: false, found: [] };
  }

  const perAllergy = getBlockedTokensPerAllergy(list);
  const found: string[] = [];
  for (const { allergy, tokens } of perAllergy) {
    if (containsAnyToken(messageLower, tokens).hit) {
      found.push(allergy);
    }
  }

  return {
    blocked: found.length > 0,
    found,
    displayAllergens: found.length > 0 ? found : undefined,
  };
}
