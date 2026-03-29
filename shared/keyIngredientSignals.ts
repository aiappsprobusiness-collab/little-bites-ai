/**
 * Ключевые продукты рецепта для плана: нормализация RU/EN, технические ингредиенты,
 * мягкий weekly penalty за повторы. Общий модуль для Edge generate-plan и клиента (Vite @shared).
 *
 * Не заменяет primaryBase (inferPrimaryBase) — отдельный сигнал разнообразия.
 */

export type KeyIngredientSignals = {
  keys: string[];
  primaryKey: string | null;
};

export type IngredientRowForKey = {
  name?: string | null;
  display_text?: string | null;
  category?: string | null;
};

/** Алиасы продуктов (порядок важен: специфичные раньше общих). */
const PRODUCT_ALIAS_PATTERNS: Array<{ key: string; patterns: RegExp[]; label: string }> = [
  { key: "corn", label: "Кукуруза", patterns: [/кукуруз/iu, /\bcorn\b/iu] },
  { key: "zucchini", label: "Кабачок", patterns: [/кабач/iu, /\bzucchini\b/iu] },
  {
    key: "cauliflower",
    label: "Цветная капуста",
    patterns: [/цветн[а-яё]*\s+капуст/iu, /\bcauliflower\b/iu],
  },
  { key: "broccoli", label: "Брокколи", patterns: [/броккол/iu, /\bbroccoli\b/iu] },
  { key: "pumpkin", label: "Тыква", patterns: [/тыкв/iu, /\bpumpkin\b/iu] },
  { key: "carrot", label: "Морковь", patterns: [/морков/iu, /\bcarrot\b/iu] },
  { key: "potato", label: "Картофель", patterns: [/карто/iu, /\bpotato\b/iu] },
  { key: "apple", label: "Яблоко", patterns: [/яблок/iu, /яблоч/iu, /\bapple\b/iu] },
  { key: "pear", label: "Груша", patterns: [/груш/iu, /\bpear\b/iu] },
  { key: "banana", label: "Банан", patterns: [/банан/iu, /\bbanana\b/iu] },
  { key: "oatmeal", label: "Овсянка", patterns: [/овсян/iu, /\boat\b/iu] },
  { key: "buckwheat", label: "Гречка", patterns: [/греч/iu, /\bbuckwheat\b/iu] },
  { key: "rice", label: "Рис", patterns: [/рис/iu, /\brice\b/iu] },
  { key: "turkey", label: "Индейка", patterns: [/индейк/iu, /индей/iu, /\bturkey\b/iu] },
  { key: "chicken", label: "Курица", patterns: [/куриц/iu, /курин/iu, /\bchicken\b/iu] },
  { key: "beef", label: "Говядина", patterns: [/говядин/iu, /говяж/iu, /\bbeef\b/iu] },
  {
    key: "salmon",
    label: "Лосось",
    patterns: [/лосос/iu, /с[её]мг/iu, /\bsalmon\b/iu],
  },
  { key: "trout", label: "Форель", patterns: [/форел/iu, /\btrout\b/iu] },
  { key: "cod", label: "Треска", patterns: [/треск/iu, /\bcod\b/iu] },
  { key: "hake", label: "Хек", patterns: [/хек/iu, /\bhake\b/iu] },
  { key: "pollock", label: "Минтай", patterns: [/минта/iu, /\bpollock\b/iu] },
  { key: "fish", label: "Рыба", patterns: [/рыба/iu, /\bfish\b/iu] },
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
  /масла/iu,
  /\boil\b/iu,
  /оливков/iu,
  /подсолнечн/iu,
  /сливочн/iu,
  /(?:^|[\s,.;])соль(?:[\s,.;]|$)/iu,
  /\bsalt\b/iu,
  /сахар/iu,
  /\bsugar\b/iu,
  /перец/iu,
  /паприк/iu,
  /корица/iu,
  /ванил/iu,
  /лавров/iu,
  /укроп/iu,
  /петрушк/iu,
  /базилик/iu,
  /ореган/iu,
  /тимьян/iu,
  /розмарин/iu,
  /чеснок/iu,
  /имбир/iu,
  /куркум/iu,
  /мука/iu,
  /\bflour\b/iu,
  /крахмал/iu,
  /разрыхлител/iu,
  /дрожж/iu,
];

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Канонический ключ продукта по строке ингредиента / названию (RU/EN). */
export function normalizeProductKey(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const text = normalizeText(raw);
  if (!text) return null;
  for (const item of PRODUCT_ALIAS_PATTERNS) {
    if (item.patterns.some((rx) => rx.test(text))) return item.key;
  }
  return null;
}

export function getKeyIngredientLabel(productKey: string): string {
  const found = PRODUCT_ALIAS_PATTERNS.find((item) => item.key === productKey);
  return found?.label ?? productKey;
}

export function isTechnicalIngredientText(text: string): boolean {
  return TECHNICAL_INGREDIENT_PATTERNS.some((rx) => rx.test(text));
}

/**
 * До `maxKeys` уникальных канонических ключей в порядке строк ингредиентов.
 * Пропускает технические строки.
 */
export function extractKeyProductKeysFromIngredients(
  ingredients: IngredientRowForKey[] | null | undefined,
  maxKeys = 3
): string[] {
  if (!ingredients?.length) return [];
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of ingredients) {
    const merged = [item.display_text ?? "", item.name ?? ""].join(" ").trim();
    if (!merged) continue;
    if (isTechnicalIngredientText(merged)) continue;
    const key = normalizeProductKey(merged);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
    if (result.length >= maxKeys) break;
  }

  return result;
}

/**
 * Сигналы для скоринга плана: 1–3 ключа из ингредиентов; если пусто — один ключ из title+description.
 */
export function deriveKeyIngredientSignals(recipe: {
  title?: string | null;
  description?: string | null;
  recipe_ingredients?: IngredientRowForKey[] | null;
}): KeyIngredientSignals {
  const fromIng = extractKeyProductKeysFromIngredients(recipe.recipe_ingredients, 3);
  if (fromIng.length > 0) {
    return { keys: fromIng, primaryKey: fromIng[0] ?? null };
  }
  const blob = [recipe.title ?? "", recipe.description ?? ""].join(" ");
  const fromTitle = normalizeProductKey(blob);
  if (fromTitle) {
    return { keys: [fromTitle], primaryKey: fromTitle };
  }
  return { keys: [], primaryKey: null };
}

/**
 * Ступенчатые «сырые» единицы штрафа по глобальному prior (сколько раз ключ уже был в блюдах окна).
 * Различает prior=2 / 4 / 7 без раннего схлопывания в один потолок.
 */
export function rawPenaltyUnitsFromPrior(prior: number): number {
  if (prior <= 1) return 0;
  if (prior === 2) return 3;
  if (prior === 3) return 6;
  if (prior === 4) return 10;
  if (prior === 5) return 14;
  if (prior === 6) return 19;
  return 19 + (prior - 6) * 4;
}

/** Ключи, для которых в breakfast/snack добавляется meal-local штраф (фрукты/крупы без special-case). */
export const MEAL_DIVERSITY_STAPLE_KEYS = new Set<string>(["apple", "banana", "oatmeal", "rice"]);

const PRIMARY_WEIGHT = 1;
const SECONDARY_WEIGHT = 0.48;
/** Потолки по частям, затем общий — чтобы поздние слоты не превращали всех кандидатов в одинаковый штраф. */
const CAP_PRIMARY = 28;
const CAP_SECONDARY = 22;
const CAP_MEAL_SLOT = 14;
const CAP_TOTAL_INGREDIENT = 48;

const MEAL_SLOT_WEIGHT = 0.42;

const MEAL_SLOTS_WITH_EXTRA_PENALTY = new Set<string>(["breakfast", "snack"]);

/**
 * @deprecated Использовать для обратной совместимости тестов; фактическая шкала задаётся `rawPenaltyUnitsFromPrior`.
 */
export const WEEKLY_KEY_INGREDIENT_PENALTY_AT_2 = 3;
export const WEEKLY_KEY_INGREDIENT_PENALTY_AT_3 = 6;
/** Общий потолок после калибровки (глобальная + meal части). */
export const WEEKLY_KEY_INGREDIENT_PENALTY_CAP = CAP_TOTAL_INGREDIENT;

export type WeeklyKeyIngredientPenaltyResult = {
  penalty: number;
  /** Уникальные ключи кандидата, по которым считался штраф */
  keysConsidered: string[];
  /** key -> uses in week before this pick */
  priorUses: Record<string, number>;
  breakdown: Array<{ key: string; prior: number; tierPenalty: number }>;
  /** Доля штрафа за primary_key (после cap части). */
  primarySubtotal?: number;
  secondarySubtotal?: number;
  mealSlotSubtotal?: number;
};

export type WeeklyKeyIngredientPenaltyOptions = {
  usedGlobal: Record<string, number>;
  usedByMeal?: Record<string, Record<string, number>> | null;
  /** Нормализованный слот: breakfast | lunch | snack | dinner */
  mealSlot?: string | null;
};

export type WeeklyKeyIngredientPenaltyCalibratedResult = WeeklyKeyIngredientPenaltyResult & {
  primarySubtotal: number;
  secondarySubtotal: number;
  mealSlotSubtotal: number;
  ingredientSubtotalBeforeTotalCap: number;
};

/**
 * Калиброванный штраф: primary сильнее secondary; отдельный мягкий штраф по breakfast/snack для степлеров.
 * Без hard-ban.
 */
export function computeWeeklyKeyIngredientPenaltyCalibrated(
  sig: KeyIngredientSignals,
  options: WeeklyKeyIngredientPenaltyOptions,
): WeeklyKeyIngredientPenaltyCalibratedResult {
  const usedGlobal = options.usedGlobal ?? {};
  const unique = [...new Set(sig.keys.filter(Boolean))];
  const primaryKey = sig.primaryKey && unique.includes(sig.primaryKey) ? sig.primaryKey : (unique[0] ?? null);

  let primaryRaw = 0;
  let secondaryRaw = 0;
  const priorUses: Record<string, number> = {};
  const breakdown: Array<{ key: string; prior: number; tierPenalty: number }> = [];

  for (const k of unique) {
    const prior = usedGlobal[k] ?? 0;
    priorUses[k] = prior;
    const raw = rawPenaltyUnitsFromPrior(prior);
    if (raw <= 0) continue;
    const role = k === primaryKey ? "primary" : "secondary";
    const w = role === "primary" ? PRIMARY_WEIGHT : SECONDARY_WEIGHT;
    const weighted = raw * w;
    if (role === "primary") primaryRaw += weighted;
    else secondaryRaw += weighted;
    breakdown.push({ key: k, prior, tierPenalty: Math.round(weighted * 100) / 100 });
  }

  const primarySubtotal = Math.min(CAP_PRIMARY, primaryRaw);
  const secondarySubtotal = Math.min(CAP_SECONDARY, secondaryRaw);
  let globalPart = primarySubtotal + secondarySubtotal;

  let mealSlotSubtotal = 0;
  const mealSlot = options.mealSlot?.trim().toLowerCase() ?? "";
  if (
    MEAL_SLOTS_WITH_EXTRA_PENALTY.has(mealSlot) &&
    options.usedByMeal != null &&
    typeof options.usedByMeal === "object"
  ) {
    const mealCounts = options.usedByMeal[mealSlot] ?? {};
    for (const k of unique) {
      if (!MEAL_DIVERSITY_STAPLE_KEYS.has(k)) continue;
      const mealPrior = mealCounts[k] ?? 0;
      const raw = rawPenaltyUnitsFromPrior(mealPrior);
      if (raw <= 0) continue;
      mealSlotSubtotal += raw * MEAL_SLOT_WEIGHT;
    }
    mealSlotSubtotal = Math.min(CAP_MEAL_SLOT, mealSlotSubtotal);
  }

  const ingredientSubtotalBeforeTotalCap = globalPart + mealSlotSubtotal;
  const penalty = Math.min(CAP_TOTAL_INGREDIENT, ingredientSubtotalBeforeTotalCap);

  return {
    penalty,
    keysConsidered: unique,
    priorUses,
    breakdown,
    primarySubtotal,
    secondarySubtotal,
    mealSlotSubtotal,
    ingredientSubtotalBeforeTotalCap,
  };
}

/**
 * `usedCounts` — сколько раз ключ уже встретился в **других** выбранных блюдах недели (глобально).
 * Для meal-aware и primary/secondary используйте `computeWeeklyKeyIngredientPenaltyCalibrated`.
 */
export function computeWeeklyKeyIngredientPenalty(
  keys: string[],
  usedCounts: Record<string, number> | null | undefined,
): WeeklyKeyIngredientPenaltyResult {
  const unique = [...new Set(keys.filter(Boolean))];
  const primaryKey = unique[0] ?? null;
  const r = computeWeeklyKeyIngredientPenaltyCalibrated(
    { keys: unique, primaryKey },
    { usedGlobal: usedCounts ?? {} },
  );
  return {
    penalty: r.penalty,
    keysConsidered: r.keysConsidered,
    priorUses: r.priorUses,
    breakdown: r.breakdown,
    primarySubtotal: r.primarySubtotal,
    secondarySubtotal: r.secondarySubtotal,
    mealSlotSubtotal: r.mealSlotSubtotal,
  };
}

export function addKeyIngredientKeysToCounts(
  keys: string[],
  global: Record<string, number>,
  mealType?: string | null,
  byMealType?: Record<string, Record<string, number>>,
): void {
  for (const k of keys) {
    if (!k) continue;
    global[k] = (global[k] ?? 0) + 1;
    if (byMealType != null && mealType && typeof mealType === "string") {
      if (!byMealType[mealType]) byMealType[mealType] = {};
      const slot = byMealType[mealType]!;
      slot[k] = (slot[k] ?? 0) + 1;
    }
  }
}
