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

/** Буква (Unicode letter) для проверки границы слова. */
function isLetter(c: string): boolean {
  return /^\p{L}$/u.test(c);
}

/**
 * Проверяет, что token встречается в text как отдельное слово (не часть другого слова).
 * Исключает ложные срабатывания: «пекан» (орех) не матчится в «запеканка».
 */
function tokenMatchesAsWord(textNorm: string, token: string): boolean {
  if (token.length < 2) return false;
  let idx = textNorm.indexOf(token);
  while (idx !== -1) {
    const before = idx === 0 ? "" : textNorm[idx - 1]!;
    const after = idx + token.length >= textNorm.length ? "" : textNorm[idx + token.length]!;
    if (!isLetter(before) && !isLetter(after)) return true;
    idx = textNorm.indexOf(token, idx + 1);
  }
  return false;
}

/**
 * Возвращает токены из списка, которые встречаются в text как отдельное слово.
 * Блокируем только при явном упоминании аллергена (например «орехи»), не при совпадении подстроки («запеканка»).
 */
export function findMatchedTokens(text: string, tokens: string[]): string[] {
  const textNorm = normalizeToken(text);
  return tokens.filter((t) => tokenMatchesAsWord(textNorm, t));
}
