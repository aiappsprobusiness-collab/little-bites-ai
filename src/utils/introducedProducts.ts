import { formatLocalDate } from "@/utils/dateUtils";
import {
  extractKeyProductKeysFromIngredients as extractKeyProductKeysFromIngredientsShared,
  getKeyIngredientLabel,
  isTechnicalIngredientText,
  normalizeProductKey as normalizeProductKeyFromShared,
} from "@shared/keyIngredientSignals";

export type IngredientForProductKey = {
  name?: string | null;
  display_text?: string | null;
  category?: string | null;
};

export function normalizeProductKey(raw: string | null | undefined): string | null {
  return normalizeProductKeyFromShared(raw);
}

/**
 * Canonical ключ продукта для прикорма: фразы «кукурузная каша», «пюре из кабачка» и т.п.
 * Синоним `normalizeProductKey` — явное имя для UI и сравнения с `introduced_product_keys`.
 */
export function normalizeIngredientToProductKey(raw: string | null | undefined): string | null {
  return normalizeProductKey(raw);
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
  return getKeyIngredientLabel(productKey);
}

export function extractKeyProductKeysFromIngredients(
  ingredients: IngredientForProductKey[] | null | undefined,
  maxKeys = 2
): string[] {
  return extractKeyProductKeysFromIngredientsShared(ingredients, maxKeys);
}

/** Все распознанные ключевые продукты (до maxKeys) — для правил прикорма «новый + введённые». */
export function extractAllKeyProductKeysFromIngredients(
  ingredients: IngredientForProductKey[] | null | undefined,
  maxKeys = 100
): string[] {
  return extractKeyProductKeysFromIngredientsShared(ingredients, maxKeys);
}

export function partitionInfantNovelAndFamiliarKeys(
  allKeys: string[],
  introducedProductKeys: string[]
): { novelKeys: string[]; familiarKeys: string[] } {
  const introducedSet = new Set(introducedProductKeys.filter(Boolean));
  const novelKeys = allKeys.filter((k) => !introducedSet.has(k));
  const familiarKeys = allKeys.filter((k) => introducedSet.has(k));
  return { novelKeys, familiarKeys };
}

/** Ключи продуктов для первого прикорма (0 введённых): только овощи из тройки. */
export const ALLOWED_START_PRODUCT_KEYS = new Set<string>(["zucchini", "broccoli", "cauliflower"]);

export type InfantFeedingMode = "standard" | "early_start";

/** 6+ мес — стандарт; &lt;6 — ранний старт (не норма). */
export function getInfantFeedingMode(ageMonths: number | null | undefined): InfantFeedingMode {
  if (ageMonths != null && ageMonths < 6) return "early_start";
  return "standard";
}

function countNonTechnicalFoodIngredientRows(ingredients: IngredientForProductKey[] | null | undefined): number {
  if (!ingredients?.length) return 0;
  let n = 0;
  for (const item of ingredients) {
    const merged = [item.display_text ?? "", item.name ?? ""].join(" ").trim();
    if (!merged) continue;
    if (isTechnicalIngredientText(merged)) continue;
    n++;
  }
  return n;
}

/** Есть ли пищевая строка без канонического ключа — нельзя считать familiar «всё введено» и нельзя корректно считать novel после старта. */
function hasNonTechnicalFoodRowWithoutProductKey(
  ingredients: IngredientForProductKey[] | null | undefined
): boolean {
  if (!ingredients?.length) return false;
  for (const item of ingredients) {
    const merged = [item.display_text ?? "", item.name ?? ""].join(" ").trim();
    if (!merged) continue;
    if (isTechnicalIngredientText(merged)) continue;
    if (!normalizeProductKey(merged)) return true;
  }
  return false;
}

export type InfantRecipeValidityResult = {
  valid: boolean;
  reason: string;
  canonicalKeys: string[];
  novelKeys: string[];
};

/**
 * Блок «Сегодня можно попробовать» (primary): старт — одна строка продукта из ALLOWED_START;
 * после старта — **ровно один** новый продукт, остальные только из введённых (не «только знакомые» — они во втором блоке).
 */
export function evaluateInfantRecipeComplementaryRules(
  ingredients: IngredientForProductKey[] | null | undefined,
  introducedProductKeys: string[]
): InfantRecipeValidityResult {
  const introduced = introducedProductKeys.filter(Boolean);
  const introducedSet = new Set(introduced);
  const canonicalKeys = extractAllKeyProductKeysFromIngredients(ingredients, 100);
  const foodRows = countNonTechnicalFoodIngredientRows(ingredients);
  const novelKeys = canonicalKeys.filter((k) => !introducedSet.has(k));

  if (introduced.length === 0) {
    if (foodRows !== 1) {
      return {
        valid: false,
        reason: foodRows === 0 ? "start_no_food_ingredient_rows" : "start_multi_food_rows",
        canonicalKeys,
        novelKeys,
      };
    }
    if (canonicalKeys.length !== 1) {
      return {
        valid: false,
        reason: canonicalKeys.length === 0 ? "start_no_recognized_product" : "start_multiple_keys",
        canonicalKeys,
        novelKeys,
      };
    }
    if (!ALLOWED_START_PRODUCT_KEYS.has(canonicalKeys[0])) {
      return { valid: false, reason: "start_not_allowed_product", canonicalKeys, novelKeys };
    }
    return { valid: true, reason: "start_ok", canonicalKeys, novelKeys };
  }

  if (canonicalKeys.length === 0) {
    return { valid: false, reason: "after_no_recognized_keys", canonicalKeys, novelKeys };
  }
  if (hasNonTechnicalFoodRowWithoutProductKey(ingredients)) {
    return {
      valid: false,
      reason: "after_unrecognized_food_row",
      canonicalKeys,
      novelKeys,
    };
  }
  if (novelKeys.length !== 1) {
    return {
      valid: false,
      reason: novelKeys.length === 0 ? "after_no_novel_for_new_block" : "after_multiple_novel_products",
      canonicalKeys,
      novelKeys,
    };
  }
  return { valid: true, reason: "after_ok", canonicalKeys, novelKeys };
}

/** Secondary-слот: только продукты из введённых (без новинок). */
export function evaluateInfantSecondaryFamiliarOnly(
  ingredients: IngredientForProductKey[] | null | undefined,
  introducedProductKeys: string[]
): InfantRecipeValidityResult {
  const introducedSet = new Set(introducedProductKeys.filter(Boolean));
  const canonicalKeys = extractAllKeyProductKeysFromIngredients(ingredients, 100);
  const novelKeys = canonicalKeys.filter((k) => !introducedSet.has(k));
  if (hasNonTechnicalFoodRowWithoutProductKey(ingredients)) {
    return {
      valid: false,
      reason: "secondary_unrecognized_food_row",
      canonicalKeys,
      novelKeys,
    };
  }
  if (canonicalKeys.length === 0) {
    return { valid: false, reason: "secondary_no_keys", canonicalKeys, novelKeys };
  }
  if (novelKeys.length > 0) {
    return { valid: false, reason: "secondary_has_novel", canonicalKeys, novelKeys };
  }
  return { valid: true, reason: "secondary_ok", canonicalKeys, novelKeys };
}

export type ValidInfantRecipesContext = {
  introducedProductKeys: string[];
  infantSlotRole?: "primary" | "secondary" | null;
};

export function getValidInfantRecipes<T extends { id: string; recipe_ingredients?: IngredientForProductKey[] | null }>(
  recipes: T[],
  context: ValidInfantRecipesContext
): T[] {
  const introduced = context.introducedProductKeys.filter(Boolean);
  const role = context.infantSlotRole ?? "primary";
  const ing = (r: T) => (r.recipe_ingredients ?? null) as IngredientForProductKey[] | null;
  if (role === "secondary") {
    return recipes.filter((r) => evaluateInfantSecondaryFamiliarOnly(ing(r), introduced).valid);
  }
  return recipes.filter((r) => evaluateInfantRecipeComplementaryRules(ing(r), introduced).valid);
}

/** Логи отклонения рецептов: `?debugInfant=1` в URL. */
export function isInfantComplementaryFeedDebug(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debugInfant") === "1";
}

/** Строки для UI: «Новый продукт: …», при необходимости «Знакомый продукт: …». */
export function getInfantPrimaryIntroducingLinesFromIngredientNames(
  ingredientNames: string[] | null | undefined,
  introducedProductKeys: string[]
): string[] {
  const ing = (ingredientNames ?? []).map((name) => ({ name, display_text: name }));
  const ev = evaluateInfantRecipeComplementaryRules(ing, introducedProductKeys);
  if (!ev.valid) return [];
  const { novelKeys, familiarKeys } = partitionInfantNovelAndFamiliarKeys(ev.canonicalKeys, introducedProductKeys);
  const lines: string[] = [];
  if (novelKeys.length === 1) {
    lines.push(`Новый продукт: ${getProductDisplayLabel(novelKeys[0])}`);
  }
  if (familiarKeys.length > 0) {
    const labels = familiarKeys.map((k) => getProductDisplayLabel(k));
    if (labels.length === 1) {
      lines.push(`Знакомый продукт: ${labels[0]}`);
    } else {
      lines.push(`Знакомые продукты: ${labels.join(", ")}`);
    }
  }
  return lines;
}

/**
 * Одна компактная строка для плана прикорма над карточкой primary (без дублирования длинных подписей).
 * Формат: «Яблоко · знакомый: гречка» и варианты для нескольких продуктов.
 */
export function getInfantPrimaryProductSummaryLine(
  ingredientNames: string[] | null | undefined,
  introducedProductKeys: string[]
): string | null {
  const ing = (ingredientNames ?? []).map((name) => ({ name, display_text: name }));
  const ev = evaluateInfantRecipeComplementaryRules(ing, introducedProductKeys);
  if (!ev.valid) return null;
  const { novelKeys, familiarKeys } = partitionInfantNovelAndFamiliarKeys(ev.canonicalKeys, introducedProductKeys);
  const novelLabels = novelKeys.map((k) => getProductDisplayLabel(k));
  const familiarLabels = familiarKeys.map((k) => getProductDisplayLabel(k));

  if (novelKeys.length === 1 && familiarLabels.length > 0) {
    return `${novelLabels[0]} · знакомый: ${familiarLabels.join(", ")}`;
  }
  if (novelKeys.length === 1) {
    return novelLabels[0];
  }
  if (novelLabels.length > 1 && familiarLabels.length > 0) {
    return `${novelLabels.join(", ")} · знакомый: ${familiarLabels.join(", ")}`;
  }
  if (novelLabels.length > 1) {
    return novelLabels.join(", ");
  }
  if (familiarLabels.length === 1) {
    return `Знакомый: ${familiarLabels[0]}`;
  }
  if (familiarLabels.length > 1) {
    return `Знакомые: ${familiarLabels.join(", ")}`;
  }
  return null;
}

/**
 * Ключи продуктов для кнопки «Добавить в введённые» и сохранения: все ингредиенты,
 * при отсутствии ключей — разбор названия блюда («кукурузная каша» → corn).
 */
export function extractProductKeysForIntroduceClick(
  ingredientNames: string[] | undefined,
  recipeTitle: string | null | undefined
): string[] {
  const ing = (ingredientNames ?? []).map((name) => ({ name, display_text: name }));
  const fromIng = extractAllKeyProductKeysFromIngredients(ing, 100);
  if (fromIng.length > 0) return fromIng;
  const fromTitle = normalizeIngredientToProductKey(recipeTitle);
  return fromTitle ? [fromTitle] : [];
}

/** До 6 мес, пустой список введённых: не брать каши/крупы как первое блюдо (по названию). */
export function isInfantFirstFoodPorridgeLikeTitle(title: string | null | undefined): boolean {
  if (!title || typeof title !== "string") return false;
  const t = title.toLowerCase();
  return /каша|крупа|крупы|манн|манка|геркулес|хлопь/i.test(t);
}

/** Ключи из рецепта, которых ещё нет во введённых — для кнопки «Добавить … в введённые». */
export function getInfantNovelProductKeysForIntroduce(
  ingredientNames: string[] | undefined,
  recipeTitle: string | null | undefined,
  introducedProductKeys: string[]
): string[] {
  const extracted = extractProductKeysForIntroduceClick(ingredientNames, recipeTitle);
  const introduced = new Set(introducedProductKeys);
  return extracted.filter((k) => !introduced.has(k));
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

/** Разница в календарных днях между двумя датами YYYY-MM-DD (локальная полуночь). */
export function calendarDaysBetweenLocalYmd(startYmd: string, endYmd: string): number {
  const parse = (s: string): Date | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const a = parse(startYmd);
  const b = parse(endYmd);
  if (!a || !b) return NaN;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * Сколько календарных дней прошло с `introducing_started_at` до `now` (в тот же день = 0).
 * `introducing_started_at` — YYYY-MM-DD (как пишет клиент).
 */
export function getIntroducingDaysPassed(introducing_started_at: string | null | undefined, now: Date): number | null {
  if (!introducing_started_at?.trim()) return null;
  const start = introducing_started_at.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const today = formatLocalDate(now);
  const diff = calendarDaysBetweenLocalYmd(start, today);
  if (!Number.isFinite(diff) || diff < 0) return null;
  return diff;
}

/**
 * День 1–3 для UI только при daysPassed 0–2; иначе null (не показываем «день 4+»).
 */
export function getIntroducingDisplayDay(introducing_started_at: string | null | undefined, now: Date): number | null {
  const dp = getIntroducingDaysPassed(introducing_started_at, now);
  if (dp == null || dp > 2) return null;
  return dp + 1;
}

/** @deprecated Используйте getIntroducingDisplayDay — то же ограничение дней 1–3. */
export function getIntroducingDayNumber(introducing_started_at: string | null | undefined, now: Date): number | null {
  return getIntroducingDisplayDay(introducing_started_at, now);
}

/** Автосброс после длительного перерыва: 5+ календарных дней с даты старта. */
export function shouldAutoClearIntroducingPeriod(introducing_started_at: string | null | undefined, now: Date): boolean {
  const dp = getIntroducingDaysPassed(introducing_started_at, now);
  return dp != null && dp >= 5;
}

/** Активное введение (дни 1–3 в UI): приоритет в пуле, конфликт при другом продукте. */
export function isIntroducingPeriodActive(
  introducing_product_key: string | null | undefined,
  introducing_started_at: string | null | undefined,
  now: Date
): boolean {
  if (!introducing_product_key?.trim() || !introducing_started_at) return false;
  const dp = getIntroducingDaysPassed(introducing_started_at, now);
  return dp != null && dp <= 2;
}

/** Пропуск 1–2 дней после «окна» 1–3: мягкий UX без номера дня. */
export function isIntroducingGracePeriod(
  introducing_product_key: string | null | undefined,
  introducing_started_at: string | null | undefined,
  now: Date
): boolean {
  if (!introducing_product_key?.trim() || !introducing_started_at) return false;
  const dp = getIntroducingDaysPassed(introducing_started_at, now);
  return dp != null && dp >= 3 && dp <= 4;
}

/** Подбор пула прикорма: базовый soft-rank плюс приоритет текущего продукта и штраф за «лишние» ключевые продукты в периоде введения. */
export function scoreInfantIntroducingPeriodSort(params: {
  ageMonths: number | null | undefined;
  introducedProductKeys: string[] | null | undefined;
  introducingProductKey: string | null | undefined;
  introducingPeriodActive: boolean;
  ingredients: IngredientForProductKey[] | null | undefined;
}): number {
  const age = params.ageMonths;
  if (age == null || !Number.isFinite(age) || age >= 12) return 0;

  const base = scoreInfantIntroducedMatch({
    ageMonths: params.ageMonths,
    introducedProductKeys: params.introducedProductKeys,
    ingredients: params.ingredients,
  });

  if (!params.introducingPeriodActive || !params.introducingProductKey) return base;

  const intro = params.introducingProductKey;
  const keyIngredients = extractKeyProductKeysFromIngredients(params.ingredients, 6);
  const introduced = new Set((params.introducedProductKeys ?? []).filter(Boolean));

  let score = base;
  if (keyIngredients.includes(intro)) score += 50;

  const novelNotIntroducing = keyIngredients.filter((k) => k !== intro && !introduced.has(k));
  score -= novelNotIntroducing.length * 12;

  return score;
}
