/**
 * Словарь алиасов и аббревиатур аллергий.
 * Используется для нормализации ввода в UI (canonical) и для построения токенов блокировки (чат, план).
 * Ягоды и т.п. — не аллергены в этом словаре (это dislikes/preferences).
 */

import { buildBlockedTokens as buildBlockedTokensLegacy } from "@/shared/allergensDictionary";
import {
  BEEF_VEAL_BLOCK_TOKENS,
  CHICKEN_ONLY_BLOCK_TOKENS,
  getMeatUmbrellaBlockTokens,
  MINCE_MEAT_TOKENS,
  PORK_BLOCK_TOKENS,
  TURKEY_ONLY_BLOCK_TOKENS,
} from "@/shared/meatAllergyTokens";

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
    tokens: ["молок", "молоко", "молочный", "молочная", "молочное", "сливк", "сливочное", "сливочным", "сливочного", "сливочное масло", "йогурт", "сыр", "творог", "кефир", "ряженк", "сметан", "масло сливочн", "казеин", "сыворот", "lactalbum", "casein", "whey", "milk", "dairy", "cheese", "yogurt", "коз", "козий", "козье", "безлактоз", "безлактозный", "goat", "lactose-free"],
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
    tokens: ["глютен", "пшениц", "рож", "ячмен", "овес", "мук", "манк", "булгур", "кускус", "макарон", "паст", "лазань", "хлеб", "выпечк", "gluten", "wheat", "rye", "barley", "oats"],
  },
  {
    canonical: "яйца",
    display: "яйца",
    aliases: ["яйцо", "яйца", "белок яйца", "egg", "egg white"],
    /**
     * Не использовать отдельный токен «белок»: он даёт ложные срабатывания на «даёт белок», «источник белка».
     * Яйцо ловим через яйц/яичн/желтк/egg и явные фразы (подстроки).
     */
    tokens: [
      "яйц",
      "яичн",
      "яичный",
      "яичная",
      "яичное",
      "желтк",
      "egg",
      "eggs",
      "белок яйц",
      "яичный белок",
      "egg white",
    ],
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
    tokens: ["орех", "ореховый", "ореховая", "ореховое", "миндал", "фундук", "кешью", "фисташк", "грецк", "пекан", "макадам", "кедров", "hazelnut", "almond", "cashew", "pistachio", "walnut", "pecan", "macadamia", "pine nut"],
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
  {
    canonical: "яблоко",
    display: "яблоко",
    aliases: ["яблоко", "яблоки", "apple", "apples"],
    tokens: ["яблок", "яблоко", "яблоч", "apple"],
  },
  {
    canonical: "банан",
    display: "банан",
    aliases: ["банан", "бананы", "banana", "bananas"],
    tokens: ["банан", "banana"],
  },
  {
    canonical: "мясо",
    display: "мясо",
    aliases: ["мясо", "meat"],
    tokens: [...getMeatUmbrellaBlockTokens()],
  },
  {
    canonical: "говядина",
    display: "говядина",
    aliases: ["говядина", "beef"],
    tokens: [...BEEF_VEAL_BLOCK_TOKENS],
  },
  {
    canonical: "телятина",
    display: "телятина",
    aliases: ["телятина", "veal"],
    tokens: [...BEEF_VEAL_BLOCK_TOKENS],
  },
  {
    canonical: "свинина",
    display: "свинина",
    aliases: ["свинина", "pork"],
    tokens: [...PORK_BLOCK_TOKENS],
  },
  {
    canonical: "курица",
    display: "курица",
    aliases: ["курица", "chicken"],
    tokens: [...CHICKEN_ONLY_BLOCK_TOKENS],
  },
  {
    canonical: "индейка",
    display: "индейка",
    aliases: ["индейка", "turkey"],
    tokens: [...TURKEY_ONLY_BLOCK_TOKENS],
  },
  {
    canonical: "фарш",
    display: "фарш",
    aliases: ["фарш", "mince", "ground meat"],
    tokens: [...MINCE_MEAT_TOKENS],
  },
];

function normalizeInput(s: string): string {
  return String(s).toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Нормализует ввод аллергии: при совпадении с alias возвращает canonical, иначе trimmed.
 * Единая точка для всех тарифов (Free/Trial/Premium).
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

/** Алиас для единого API: нормализация аллергии (аббревиатуры, синонимы → canonical). */
export const normalizeAllergyToken = normalizeAllergyInput;

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

/** Для аудита: каждая аллергия → canonical (если из словаря) и её токены до объединения. */
export function expandAllergiesToCanonicalBlockedGroups(
  allergies: string[] | null | undefined,
): Array<{ allergy: string; canonical?: string; tokens: string[] }> {
  const list = Array.isArray(allergies) ? allergies : allergies ? [String(allergies)] : [];
  const out: Array<{ allergy: string; canonical?: string; tokens: string[] }> = [];
  for (const a of list) {
    const s = String(a).trim();
    if (!s) continue;
    const { canonical, tokens } = expandAllergyToTokens(s);
    out.push({ allergy: s, canonical, tokens: [...tokens] });
  }
  return out;
}

/** Fallback: старый словарь для значений не из ALLERGY_ALIASES. */
function buildBlockedTokensFallback(allergyItem: string): string[] {
  return buildBlockedTokensLegacy([allergyItem]);
}
