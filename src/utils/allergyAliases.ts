/**
 * Словарь алиасов и аббревиатур аллергий.
 * Используется для нормализации ввода в UI (canonical) и для построения токенов блокировки (чат, план).
 * Ягоды и т.п. — не аллергены в этом словаре (это dislikes/preferences).
 */

import { buildBlockedTokens as buildBlockedTokensLegacy } from "@/shared/allergensDictionary";

export type AllergyAlias = {
  canonical: string;
  display: string;
  aliases: string[];
  tokens: string[];
};

export const ALLERGY_ALIASES: AllergyAlias[] = [
  {
    canonical: "белок коровьего молока",
    display: "БКМ",
    aliases: ["бкм", "абкм", "cmpa", "cow milk protein", "milk protein"],
    tokens: ["молок", "сливк", "йогурт", "сыр", "творог", "кефир", "ряженк", "сметан", "масло сливочн", "казеин", "сыворот", "lactalbum", "casein", "whey", "milk", "dairy", "cheese", "yogurt"],
  },
  {
    canonical: "лактоза",
    display: "лактоза",
    aliases: ["лактоза", "лн", "lactose"],
    tokens: ["лактоз", "lactose"],
  },
  {
    canonical: "глютен",
    display: "глютен",
    aliases: ["глютен", "целиакия", "gluten", "celiac"],
    tokens: ["глютен", "пшениц", "рож", "ячмен", "овес", "мук", "манк", "булгур", "кускус", "макарон", "хлеб", "выпечк", "gluten", "wheat", "rye", "barley", "oats"],
  },
  {
    canonical: "яйца",
    display: "яйца",
    aliases: ["яйцо", "яйца", "белок яйца", "egg", "egg white"],
    tokens: ["яйц", "белок", "желтк", "egg", "eggs"],
  },
  {
    canonical: "рыба",
    display: "рыба",
    aliases: ["рыба", "fish"],
    tokens: ["рыб", "лосос", "треск", "тунец", "семг", "форел", "сельд", "скумбр", "минтай", "судак", "fish", "salmon", "cod", "tuna"],
  },
  {
    canonical: "морепродукты",
    display: "морепродукты",
    aliases: ["морепродукты", "мс", "seafood", "shellfish"],
    tokens: ["кревет", "мид", "кальмар", "осьмин", "краб", "икра", "устриц", "seafood", "shrimp", "prawn", "mussel", "squid", "octopus", "crab", "caviar"],
  },
  {
    canonical: "орехи",
    display: "орехи",
    aliases: ["орехи", "tree nuts", "nuts", "др"],
    tokens: ["орех", "миндал", "фундук", "кешью", "фисташк", "грецк", "пекан", "макадам", "кедров", "hazelnut", "almond", "cashew", "pistachio", "walnut", "pecan", "macadamia", "pine nut"],
  },
  {
    canonical: "арахис",
    display: "арахис",
    aliases: ["арахис", "peanut"],
    tokens: ["арахис", "peanut"],
  },
  {
    canonical: "соя",
    display: "соя",
    aliases: ["соя", "soy", "soya"],
    tokens: ["соя", "соев", "тофу", "соус соев", "soy", "soya", "tofu"],
  },
  {
    canonical: "кунжут",
    display: "кунжут",
    aliases: ["кунжут", "sesame", "тахини", "tahini"],
    tokens: ["кунжут", "тахин", "сезам", "sesame", "tahini"],
  },
  {
    canonical: "мёд",
    display: "мёд",
    aliases: ["мёд", "мед", "honey"],
    tokens: ["мёд", "мед", "honey"],
  },
  {
    canonical: "горчица",
    display: "горчица",
    aliases: ["горчица", "mustard"],
    tokens: ["горчиц", "mustard"],
  },
  {
    canonical: "сельдерей",
    display: "сельдерей",
    aliases: ["сельдерей", "celery"],
    tokens: ["сельдер", "celery"],
  },
  {
    canonical: "люпин",
    display: "люпин",
    aliases: ["люпин", "lupin"],
    tokens: ["люпин", "lupin"],
  },
  {
    canonical: "сульфиты",
    display: "сульфиты",
    aliases: ["сульфиты", "sulfites", "e220", "e-220"],
    tokens: ["сульфит", "sulfite", "e220", "e-220"],
  },
];

function normalizeInput(s: string): string {
  return String(s).toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Нормализует ввод аллергии: при совпадении с alias возвращает canonical, иначе trimmed.
 */
export function normalizeAllergyInput(input: string): string {
  const n = normalizeInput(input);
  if (!n) return input.trim();
  for (const a of ALLERGY_ALIASES) {
    if (a.canonical.toLowerCase() === n) return a.canonical;
    if (a.aliases.some((al) => al === n)) return a.canonical;
  }
  return input.trim();
}

export interface ExpandResult {
  canonical?: string;
  tokens: string[];
}

/**
 * По одному значению аллергии возвращает canonical (если из словаря) и токены для блокировки.
 */
export function expandAllergyToTokens(allergyItem: string): ExpandResult {
  const n = normalizeInput(allergyItem);
  if (!n) return { tokens: [] };
  for (const a of ALLERGY_ALIASES) {
    if (a.canonical.toLowerCase() === n || a.aliases.some((al) => al === n)) {
      return { canonical: a.canonical, tokens: [...a.tokens] };
    }
  }
  const fallback = buildBlockedTokensFallback(allergyItem);
  return { tokens: fallback };
}

/**
 * Строит уникальный список токенов по списку аллергий (для блокировки в чате и плане).
 */
export function buildBlockedTokensFromAllergies(allergies: string[] | null | undefined): string[] {
  const list = Array.isArray(allergies) ? allergies : allergies ? [String(allergies)] : [];
  const set = new Set<string>();
  for (const a of list) {
    const s = String(a).trim();
    if (!s) continue;
    const { tokens } = expandAllergyToTokens(s);
    for (const t of tokens) {
      if (t.length >= 2) set.add(t);
    }
  }
  return [...set];
}

/** Fallback: старый словарь для значений не из ALLERGY_ALIASES. */
function buildBlockedTokensFallback(allergyItem: string): string[] {
  return buildBlockedTokensLegacy([allergyItem]);
}
