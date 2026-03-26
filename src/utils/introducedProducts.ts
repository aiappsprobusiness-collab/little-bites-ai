export type IngredientForProductKey = {
  name?: string | null;
  display_text?: string | null;
  category?: string | null;
};

/**
 * JS `\b` word boundary does NOT treat Cyrillic letters as word chars (`\w` is [A-Za-z0-9_]).
 * Russian stems must match without `\b`, otherwise "кабачок" never matches `\bкабач`.
 */
const PRODUCT_ALIAS_PATTERNS: Array<{ key: string; patterns: RegExp[]; label: string }> = [
  { key: "zucchini", label: "Кабачок", patterns: [/кабач/iu, /\bzucchini\b/iu] },
  { key: "cauliflower", label: "Цветная капуста", patterns: [/цветн\w*\s+капуст/iu, /\bcauliflower\b/iu] },
  { key: "broccoli", label: "Брокколи", patterns: [/броккол/iu, /\bbroccoli\b/iu] },
  { key: "pumpkin", label: "Тыква", patterns: [/тыкв/iu, /\bpumpkin\b/iu] },
  { key: "carrot", label: "Морковь", patterns: [/морков/iu, /\bcarrot\b/iu] },
  { key: "potato", label: "Картофель", patterns: [/карто/iu, /\bpotato\b/iu] },
  { key: "apple", label: "Яблоко", patterns: [/яблок/iu, /\bapple\b/iu] },
  { key: "pear", label: "Груша", patterns: [/груш/iu, /\bpear\b/iu] },
  { key: "banana", label: "Банан", patterns: [/банан/iu, /\bbanana\b/iu] },
  { key: "oatmeal", label: "Овсянка", patterns: [/овсян/iu, /\boat\b/iu] },
  { key: "buckwheat", label: "Гречка", patterns: [/греч/iu, /\bbuckwheat\b/iu] },
  { key: "rice", label: "Рис", patterns: [/рис/iu, /\brice\b/iu] },
  { key: "turkey", label: "Индейка", patterns: [/индейк/iu, /\bturkey\b/iu] },
  { key: "chicken", label: "Курица", patterns: [/куриц/iu, /\bchicken\b/iu] },
  { key: "beef", label: "Говядина", patterns: [/говядин/iu, /\bbeef\b/iu] },
  { key: "egg", label: "Яйцо", patterns: [/яйц/iu, /\begg\b/iu] },
  { key: "cottage_cheese", label: "Творог", patterns: [/творо/iu, /\bcottage\s*cheese\b/iu] },
  { key: "kefir", label: "Кефир", patterns: [/кефир/iu, /\bkefir\b/iu] },
  { key: "yogurt", label: "Йогурт", patterns: [/йогурт/iu, /\byogh?urt\b/iu] },
];

const TECHNICAL_INGREDIENT_PATTERNS: RegExp[] = [
  /(?:^|[\s,.;])вода(?:[\s,.;]|$)/iu,
  /кипяток/iu,
  /\bwater\b/iu,
  /масло/iu,
  /\boil\b/iu,
  /(?:^|[\s,.;])соль(?:[\s,.;]|$)/iu,
  /\bsalt\b/iu,
];

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeProductKey(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const text = normalizeText(raw);
  if (!text) return null;
  for (const item of PRODUCT_ALIAS_PATTERNS) {
    if (item.patterns.some((rx) => rx.test(text))) return item.key;
  }
  return null;
}

export function normalizeProductKeys(values: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const key = normalizeProductKey(value);
    if (key) out.add(key);
  }
  return [...out];
}

export function getProductDisplayLabel(productKey: string): string {
  const found = PRODUCT_ALIAS_PATTERNS.find((item) => item.key === productKey);
  return found?.label ?? productKey;
}

function isTechnicalIngredient(text: string): boolean {
  return TECHNICAL_INGREDIENT_PATTERNS.some((rx) => rx.test(text));
}

export function extractKeyProductKeysFromIngredients(
  ingredients: IngredientForProductKey[] | null | undefined,
  maxKeys = 2
): string[] {
  if (!ingredients?.length) return [];
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of ingredients) {
    const merged = [item.display_text ?? "", item.name ?? ""].join(" ").trim();
    if (!merged) continue;
    if (isTechnicalIngredient(merged)) continue;
    const key = normalizeProductKey(merged);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
    if (result.length >= maxKeys) break;
  }

  return result;
}

export function scoreInfantIntroducedMatch(params: {
  ageMonths: number | null | undefined;
  introducedProductKeys: string[] | null | undefined;
  ingredients: IngredientForProductKey[] | null | undefined;
}): number {
  const age = params.ageMonths;
  if (age == null || !Number.isFinite(age) || age >= 12) return 0;
  const introduced = new Set((params.introducedProductKeys ?? []).filter(Boolean));
  if (introduced.size === 0) return 0;

  const keyIngredients = extractKeyProductKeysFromIngredients(params.ingredients, 2);
  if (keyIngredients.length === 0) return 0;

  const matched = keyIngredients.filter((k) => introduced.has(k)).length;
  const novel = keyIngredients.length - matched;

  if (age <= 6) return matched * 6 - novel * 2;
  if (age <= 8) return matched * 4 - Math.max(0, novel - 1) * 1.5;
  return matched * 3 - novel * 0.5;
}
