/**
 * Правила прикорма для блоков «новый продукт» (primary) и «знакомое» (secondary).
 * Общий источник для клиента (Vite @shared) и Edge generate-plan (относительный импорт).
 */
import {
  extractKeyProductKeysFromIngredients,
  extractKeyProductKeysFromTextBlob,
  isTechnicalIngredientText,
  normalizeProductKey,
} from "./keyIngredientSignals.ts";

export type IngredientForProductKey = {
  name?: string | null;
  display_text?: string | null;
  category?: string | null;
};

/** Все распознанные ключевые продукты (до maxKeys). */
export function extractAllKeyProductKeysFromIngredients(
  ingredients: IngredientForProductKey[] | null | undefined,
  maxKeys = 100
): string[] {
  return extractKeyProductKeysFromIngredients(ingredients, maxKeys);
}

/** Ключи продуктов для первого прикорма (0 введённых): только овощи из тройки. */
export const ALLOWED_START_PRODUCT_KEYS = new Set<string>(["zucchini", "broccoli", "cauliflower"]);

/** Название/описание рецепта — дополнительный источник ключей (желток в названии и т.п.). */
export type InfantRecipeTextMeta = {
  title?: string | null;
  description?: string | null;
};

function mergeCanonicalProductKeys(
  ingredients: IngredientForProductKey[] | null | undefined,
  meta?: InfantRecipeTextMeta | null
): string[] {
  const fromIng = extractAllKeyProductKeysFromIngredients(ingredients, 100);
  const blob = [meta?.title ?? "", meta?.description ?? ""].join(" ");
  const fromText = extractKeyProductKeysFromTextBlob(blob);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of [...fromIng, ...fromText]) {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

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
 * после старта — **ровно один** новый продукт, остальные только из введённых.
 */
export function evaluateInfantRecipeComplementaryRules(
  ingredients: IngredientForProductKey[] | null | undefined,
  introducedProductKeys: string[],
  meta?: InfantRecipeTextMeta | null
): InfantRecipeValidityResult {
  const introduced = introducedProductKeys.filter(Boolean);
  const introducedSet = new Set(introduced);
  const canonicalKeys = mergeCanonicalProductKeys(ingredients, meta);
  const novelKeys = canonicalKeys.filter((k) => !introducedSet.has(k));

  if (introduced.length === 0) {
    if (hasNonTechnicalFoodRowWithoutProductKey(ingredients)) {
      return {
        valid: false,
        reason: "start_unrecognized_food_row",
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
  introducedProductKeys: string[],
  meta?: InfantRecipeTextMeta | null
): InfantRecipeValidityResult {
  const introducedSet = new Set(introducedProductKeys.filter(Boolean));
  const canonicalKeys = mergeCanonicalProductKeys(ingredients, meta);
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
