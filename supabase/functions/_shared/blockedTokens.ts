/**
 * Единый helper для блокировки запроса по allergies/dislikes (чат).
 * Токены расширяются через allergens/allergensDictionary (в т.ч. ягоды → berry/ягодный и т.д.).
 */

import { getBlockedTokensFromAllergies } from "./allergens.ts";

export function normalizeToken(s: string): string {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export interface BlockedTokenSet {
  allergyItems: Array<{ display: string; tokens: string[] }>;
  dislikeItems: Array<{ display: string; tokens: string[] }>;
}

/**
 * Строит набор токенов для проверки запроса: отдельно по аллергиям и по dislikes.
 * display — человеко-читаемая подпись для сообщения; tokens — стемы/синонимы для матча.
 */
export function buildBlockedTokenSet(params: {
  allergies: string[];
  dislikes: string[];
}): BlockedTokenSet {
  const { allergies, dislikes } = params;
  const allergyItems = (allergies ?? [])
    .map((a) => String(a).trim())
    .filter(Boolean)
    .map((display) => ({
      display,
      tokens: getBlockedTokensFromAllergies([display]),
    }));
  const dislikeItems = (dislikes ?? [])
    .map((d) => String(d).trim())
    .filter(Boolean)
    .map((display) => ({
      display,
      tokens: getBlockedTokensFromAllergies([display]),
    }));
  return { allergyItems, dislikeItems };
}

/**
 * Удаляет из текста фразы «без X» (запрос исключения ингредиента).
 * Если аллерген упомянут только в таком контексте — не блокируем (даём рецепт без него).
 */
export function textWithoutExclusionPhrases(text: string): string {
  return text.replace(/без\s+[^,.\n]+/gi, " ");
}

/**
 * Возвращает токены из списка, которые встречаются в text (подстрока, без regex).
 */
export function findMatchedTokens(text: string, tokens: string[]): string[] {
  const textNorm = normalizeToken(text);
  return tokens.filter((t) => t.length >= 2 && textNorm.includes(t));
}
