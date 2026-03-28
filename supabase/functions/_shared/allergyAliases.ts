/**
 * Словарь алиасов и аббревиатур аллергий (Deno Edge).
 * Совпадает с src/utils/allergyAliases.ts. Используется для блокировки в чате и плане.
 */

import { buildBlockedTokens as buildBlockedTokensLegacy } from "./allergensDictionary.ts";

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
    tokens: ["глютен", "пшениц", "рож", "ячмен", "овес", "мук", "манк", "булгур", "кускус", "макарон", "хлеб", "выпечк", "gluten", "wheat", "rye", "barley", "oats"],
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
];

function normalizeInput(s: string): string {
  return String(s).toLowerCase().trim().replace(/\s+/g, " ");
}

export interface ExpandResult {
  canonical?: string;
  tokens: string[];
}

export function expandAllergyToTokens(allergyItem: string): ExpandResult {
  const n = normalizeInput(allergyItem);
  if (!n) return { tokens: [] };
  for (const a of ALLERGY_ALIASES) {
    if (a.canonical.toLowerCase() === n || a.aliases.some((al) => al === n)) {
      return { canonical: a.canonical, tokens: [...a.tokens] };
    }
  }
  const fallback = buildBlockedTokensLegacy([allergyItem]);
  return { tokens: fallback };
}

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
