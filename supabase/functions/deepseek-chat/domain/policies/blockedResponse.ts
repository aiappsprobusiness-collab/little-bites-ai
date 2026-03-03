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
  suggestedAlternatives: string[],
  intendedDishHint: string
): string {
  const items = matchedDisplay.length > 0 ? matchedDisplay.join(", ") : "это";
  let line1: string;
  if (blockedBy === "allergy") {
    line1 = `У профиля «${profileName}» указана аллергия на: ${items}. Смените профиль или замените аллерген на новый ингредиент.`;
  } else {
    line1 = `Профиль «${profileName}» не любит: ${items}. Смените профиль или замените аллерген на новый ингредиент.`;
  }
  const firstAlt = suggestedAlternatives[0] ?? "банан";
  const dishWord = intendedDishHint || "десерт";
  const line2 = `Напишите: «вариант с ${firstAlt}» или просто «${firstAlt}» — и я предложу тот же ${dishWord} без ${items}.`;
  return `${line1}\n\n${line2}`;
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
