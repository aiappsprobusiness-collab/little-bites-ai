/**
 * Единый формат ответа «запрос заблокирован» (аллергия или dislikes профиля).
 * Используется при client pre-check и в ответе Edge (deepseek-chat).
 */

export type ChatBlockedBy = "allergy" | "dislike";

export interface ChatBlockedResponse {
  blocked: true;
  blocked_by: ChatBlockedBy;
  profile_name: string;
  /** Найденные токены (для отображения пользователю как причина). */
  matched: string[];
  /** Готовый текст для UI. */
  message: string;
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
};

const DEFAULT_ALTERNATIVES = ["другие ингредиенты на ваш выбор"];

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
 * Формат: "У профиля «X» указано: АЛЛЕРГИЯ/НЕ ЛЮБИТ — {items}. Поэтому рецепт с этим ингредиентом я не предложу."
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
  const line1 = `У профиля «${profileName}» указано: ${label} — ${items}. Поэтому рецепт с этим ингредиентом я не предложу.`;
  if (options?.addAlternatives !== false && matched.length > 0) {
    const alts = findAlternatives(matched);
    const line2 = `Попробуйте заменить на: ${alts.join(", ")}.`;
    return `${line1}\n\n${line2}`;
  }
  return line1;
}
