/**
 * Жёсткое правило аллергий для ЧАТА (профиль по умолчанию).
 * Перед отправкой в DeepSeek проверяем: есть ли в запросе пользователя
 * хоть одно слово-продукт из списка аллергий (точное совпадение по словам).
 */

const PUNCT = /[\s,.\-!?;:()]+/;

function normalizedWords(text: string): string[] {
  return text
    .split(PUNCT)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

export interface ChatAllergyCheckResult {
  blocked: boolean;
  found: string[];
}

/**
 * Проверяет, есть ли в тексте запроса пользователя слово-продукт из списка аллергий.
 * Сравнение: точное совпадение слова (без учёта регистра) с элементом словаря аллергий.
 */
export function checkChatAllergyBlock(
  userMessage: string,
  allergies: string[] | null | undefined
): ChatAllergyCheckResult {
  const list = (allergies || []).filter((a) => typeof a === 'string' && a.trim().length > 0);
  if (list.length === 0) {
    return { blocked: false, found: [] };
  }

  const words = normalizedWords(userMessage);
  const allergySet = new Set(list.map((a) => a.trim().toLowerCase()));
  const found: string[] = [];

  for (const w of words) {
    if (allergySet.has(w)) {
      const orig = list.find((a) => a.trim().toLowerCase() === w);
      if (orig && !found.includes(orig)) found.push(orig);
    }
  }

  return {
    blocked: found.length > 0,
    found,
  };
}
