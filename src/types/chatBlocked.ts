/**
 * Единый формат ответа «запрос заблокирован» (аллергия или dislikes профиля).
 * Используется при client pre-check и в ответе Edge (deepseek-chat).
 */

export type ChatBlockedBy = "allergy" | "dislike";

/** Мета для follow-up после blocked: хранится в chat_history.meta и в состоянии сообщения. */
export interface BlockedMeta {
  blocked: true;
  original_query: string;
  blocked_items: string[];
  suggested_alternatives: string[];
  intended_dish_hint?: string;
}

export interface ChatBlockedResponse {
  blocked: true;
  blocked_by: ChatBlockedBy;
  profile_name: string;
  /** Найденные токены (для отображения пользователю как причина). */
  matched: string[];
  /** Готовый текст для UI. */
  message: string;
  /** Для follow-up и сохранения в chat_history.meta */
  blocked_items?: string[];
  suggested_alternatives?: string[];
  original_query?: string;
  intended_dish_hint?: string;
}

/** Проверка: ответ от чата — заблокирован по профилю. */
export function isChatBlockedResponse(
  data: unknown
): data is ChatBlockedResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as ChatBlockedResponse).blocked === true &&
    ((data as ChatBlockedResponse).blocked_by === "allergy" ||
      (data as ChatBlockedResponse).blocked_by === "dislike")
  );
}

/** До 3 альтернатив по смыслу (для подсказки «Попробуйте заменить на»). */
const ALTERNATIVES: Record<string, string[]> = {
  куриц: ["индейка", "говядина", "рыба"],
  курица: ["индейка", "говядина", "рыба"],
  chicken: ["индейка", "говядина", "рыба"],
  молок: ["овощной бульон", "вода", "кокосовое молоко"],
  молоко: ["овощной бульон", "вода", "кокосовое молоко"],
  орех: ["семечки", "кунжут", "подсолнечник"],
  орехи: ["семечки", "кунжут", "подсолнечник"],
  лук: ["чеснок", "зелень", "сладкий перец"],
  лука: ["чеснок", "зелень", "сладкий перец"],
  яйц: ["льняная мука", "банан", "йогурт"],
  яйца: ["льняная мука", "банан", "йогурт"],
  рыб: ["индейка", "курица", "тофу"],
  рыба: ["индейка", "курица", "тофу"],
  глютен: ["рис", "гречка", "киноа"],
  мясо: ["индейка", "рыба", "бобовые"],
  ягод: ["фрукты", "банан", "яблоко"],
  ягоды: ["фрукты", "банан", "яблоко"],
  berry: ["фрукты", "банан", "яблоко"],
  berries: ["фрукты", "банан", "яблоко"],
};

const DEFAULT_ALTERNATIVES = ["другие ингредиенты на ваш выбор"];

/** Экспорт для использования в checkChatRequestAgainstProfile (meta для follow-up). */
export function getSuggestedAlternativesForBlocked(matched: string[]): string[] {
  return findAlternatives(matched);
}

function findAlternatives(matched: string[]): string[] {
  const lower = matched.map((m) => String(m).trim().toLowerCase()).filter(Boolean);
  for (const m of lower) {
    for (const [key, alts] of Object.entries(ALTERNATIVES)) {
      if (m.includes(key) || key.includes(m)) return alts.slice(0, 3);
    }
  }
  return DEFAULT_ALTERNATIVES;
}

/**
 * Собирает сообщение для пользователя при блокировке.
 * Формат: "У профиля «X» указано: АЛЛЕРГИЯ/НЕ ЛЮБИТ — {items}. Смените профиль или замените аллерген на новый ингредиент."
 * Вторая строка: "Попробуйте заменить на: A, B, C."
 */
export function buildBlockedMessage(
  profileName: string,
  blockedBy: ChatBlockedBy,
  matched: string[],
  options?: { addAlternatives?: boolean }
): string {
  const label = blockedBy === "allergy" ? "аллергия" : "не любит";
  const items = matched.length > 0 ? matched.join(", ") : "это";
  const line1 = `У профиля «${profileName}» указано: ${label} — ${items}. Смените профиль или замените аллерген на новый ингредиент.`;
  if (options?.addAlternatives !== false && matched.length > 0) {
    const alts = findAlternatives(matched);
    const line2 = `Попробуйте заменить на: ${alts.join(", ")}.`;
    return `${line1}\n\n${line2}`;
  }
  return line1;
}
