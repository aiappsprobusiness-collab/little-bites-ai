/**
 * Формирование ответа «заблокировано» (аллергия/dislike): подсказки и текст сообщения.
 * Контракт ответа совместим с текущим клиентом.
 */

export type BlockedBy = "allergy" | "dislike";

const BLOCKED_ALTERNATIVES: Record<string, string[]> = {
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
  рыб: ["индейка", "курица", "тофу"],
  глютен: ["рис", "гречка", "киноа"],
  мясо: ["индейка", "рыба", "бобовые"],
  ягод: ["фрукты", "банан", "яблоко"],
  ягоды: ["фрукты", "банан", "яблоко"],
  berry: ["фрукты", "банан", "яблоко"],
  berries: ["фрукты", "банан", "яблоко"],
};

export function getSuggestedAlternatives(matchedDisplay: string[]): string[] {
  const lower = matchedDisplay.map((m) => String(m).trim().toLowerCase()).filter(Boolean);
  for (const m of lower) {
    for (const [key, alts] of Object.entries(BLOCKED_ALTERNATIVES)) {
      if (m.includes(key) || key.includes(m)) return alts.slice(0, 3);
    }
  }
  return ["другие ингредиенты на ваш выбор"];
}

/** Вытаскивает «блюдо» из запроса для подсказки follow-up. */
export function extractIntendedDishHint(originalQuery: string, blockedItem: string): string {
  const q = (originalQuery ?? "").trim();
  if (!q) return "";
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  const blockedLower = (blockedItem ?? "").toLowerCase();
  const withoutBlocked = words.filter((w) => !w.toLowerCase().includes(blockedLower) && blockedLower !== w.toLowerCase());
  if (withoutBlocked.length > 0) return withoutBlocked.join(" ");
  return words.length > 0 ? words[words.length - 1]! : q;
}

export function buildBlockedMessageEdge(
  profileName: string,
  blockedBy: BlockedBy,
  matchedDisplay: string[],
  _suggestedAlternatives: string[],
  _intendedDishHint: string
): string {
  const items = matchedDisplay.length > 0 ? matchedDisplay.join(", ") : "это";
  if (blockedBy === "allergy") {
    const named =
      profileName &&
      profileName !== "Семья" &&
      !/выбранного профиля/i.test(profileName);
    if (named) {
      return `У профиля «${profileName}» указана аллергия на ${items}. Попробуйте изменить запрос или выбрать другой профиль.`;
    }
    return `У профиля указана аллергия на ${items}. Попробуйте изменить запрос или выбрать другой профиль.`;
  }
  return `Профиль «${profileName}» не любит: ${items}. Измените запрос или выберите другой профиль.`;
}

/** Ответ 200 JSON при блокировке по аллергии (pre-request и post-recipe safety). */
export function buildAllergyBlockedResponsePayload(params: {
  profileName: string;
  blockedItems: string[];
  userMessage: string;
}): BlockedResponsePayload {
  const { profileName, blockedItems, userMessage } = params;
  const suggestedAlternatives = getSuggestedAlternatives(blockedItems);
  const first = blockedItems[0] ?? "";
  const intendedDishHint = extractIntendedDishHint(userMessage, first);
  const message = buildBlockedMessageEdge(profileName, "allergy", blockedItems, suggestedAlternatives, intendedDishHint);
  return {
    blocked: true,
    blocked_by: "allergy",
    profile_name: profileName,
    blocked_items: blockedItems,
    suggested_alternatives: suggestedAlternatives,
    original_query: userMessage,
    intended_dish_hint: intendedDishHint || undefined,
    message,
  };
}

export interface BlockedResponsePayload {
  blocked: true;
  blocked_by: BlockedBy;
  profile_name: string;
  blocked_items: string[];
  suggested_alternatives: string[];
  original_query: string;
  intended_dish_hint?: string;
  message: string;
}
