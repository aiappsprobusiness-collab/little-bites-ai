/**
 * Единый источник истины для токенов аллергенов.
 * Чистый TS без DOM/Node — используется в Vite (frontend) и копируется в Edge (Deno).
 * Не опираемся на recipe_ingredients.category — только на name/display_text/title.
 */

export type AllergenKey =
  | "milk"
  | "chicken"
  | "turkey"
  | "nuts"
  | "eggs"
  | "fish"
  | "gluten"
  | "berries";

/** По категории — полный список токенов для матча (подстроки в тексте). */
export const ALLERGEN_TOKENS: Record<AllergenKey, string[]> = {
  milk: [
    "молоко",
    "молочн",
    "сливки",
    "сметана",
    "творог",
    "сыр",
    "йогурт",
    "кефир",
    "ряженка",
    "простокваша",
    "молочк",
    "лактоз",
    "казеин",
    "сливочн",
    "milk",
    "dairy",
    "cream",
    "curd",
    "cheese",
    "yogurt",
    "kefir",
    "lactose",
    "casein",
  ],
  chicken: [
    "кур",
    "куриц",
    "курин",
    "куриный",
    "куриная",
    "куриное",
    "птиц",
    "филе кур",
    "бульон кур",
    "chicken",
    "poultry",
  ],
  turkey: ["индейк", "turkey"],
  nuts: [
    "орех",
    "орехи",
    "орехов",
    "орешн",
    "миндал",
    "фундук",
    "кешью",
    "грецк",
    "nut",
    "nuts",
    "almond",
    "hazelnut",
    "cashew",
    "walnut",
  ],
  eggs: ["яйц", "яичн", "яичный", "egg", "eggs"],
  fish: [
    "рыб",
    "рыбный",
    "лосос",
    "треск",
    "сельд",
    "тунец",
    "минтай",
    "fish",
    "salmon",
    "cod",
    "herring",
    "tuna",
  ],
  gluten: [
    "глютен",
    "пшениц",
    "мук",
    "хлеб",
    "gluten",
    "wheat",
    "flour",
    "bread",
  ],
  berries: [
    "ягод",
    "ягоды",
    "ягодн",
    "berry",
    "berries",
    "blueberr",
    "raspberr",
    "strawberr",
    "blackberr",
    "currant",
  ],
};

/** Триггер-подстроки (ключ введённой аллергии) → категория. Для расширения по словарю. */
const TRIGGER_TO_KEY: Record<string, AllergenKey> = {
  молок: "milk",
  milk: "milk",
  лактоз: "milk",
  lactose: "milk",
  dairy: "milk",
  казеин: "milk",
  casein: "milk",
  куриц: "chicken",
  курица: "chicken",
  chicken: "chicken",
  птиц: "chicken",
  poultry: "chicken",
  индейк: "turkey",
  turkey: "turkey",
  орех: "nuts",
  орехи: "nuts",
  nut: "nuts",
  nuts: "nuts",
  яйц: "eggs",
  яйца: "eggs",
  egg: "eggs",
  eggs: "eggs",
  рыб: "fish",
  fish: "fish",
  глютен: "gluten",
  gluten: "gluten",
  пшениц: "gluten",
  wheat: "gluten",
  ягод: "berries",
  ягоды: "berries",
  berry: "berries",
  berries: "berries",
  blueberr: "berries",
  raspberr: "berries",
  strawberr: "berries",
  blackberr: "berries",
  currant: "berries",
};

function tokenize(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

export function normalizeToken(t: string): string {
  return String(t).toLowerCase().trim();
}

function expandAllergyToTokens(allergy: string): string[] {
  const lower = normalizeToken(allergy);
  if (!lower) return [];
  const tokens = new Set<string>(tokenize(lower));
  const added = new Set<AllergenKey>();
  for (const trigger of Object.keys(TRIGGER_TO_KEY)) {
    const key = TRIGGER_TO_KEY[trigger];
    if (added.has(key)) continue;
    const matches =
      lower.includes(trigger) ||
      [...tokens].some((t) => trigger.includes(t) || t.includes(trigger));
    if (matches) {
      added.add(key);
      for (const t of ALLERGEN_TOKENS[key]) tokens.add(t);
    }
  }
  return [...tokens];
}

/**
 * Строит блокирующие токены по списку аллергий: словарь + fallback токенизация введённого текста.
 */
export function buildBlockedTokens(
  allergies: string[] | null | undefined
): string[] {
  const list = Array.isArray(allergies) ? allergies : allergies ? [String(allergies)] : [];
  const out = new Set<string>();
  for (const a of list) {
    const s = String(a).trim();
    if (!s) continue;
    for (const t of tokenize(s)) {
      if (t.length >= 2) out.add(t);
    }
    for (const t of expandAllergyToTokens(s)) {
      if (t.length >= 2) out.add(t);
    }
  }
  return [...out];
}

export function containsAnyToken(
  text: string,
  tokens: string[]
): { hit: boolean; found: string[] } {
  if (!text || tokens.length === 0)
    return { hit: false, found: [] };
  const h = (text ?? "").toLowerCase();
  const found: string[] = [];
  for (const t of tokens) {
    if (t.length >= 2 && h.includes(t)) found.push(t);
  }
  return { hit: found.length > 0, found };
}
