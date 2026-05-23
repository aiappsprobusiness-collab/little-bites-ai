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

/**
 * Пул плана для прикорма (один ребёнок 4–11 мес): только curated `source=seed` + `trust_level=core`.
 * Не «Семья», не взрослый; 0–3 мес — без этого ограничения (узкий edge-case).
 */
export function isInfantComplementarySeedCorePoolAge(
  memberData: { age_months?: number | null; type?: string | null } | null | undefined,
  memberId: string | null | undefined,
): boolean {
  if (memberId == null || String(memberId).trim() === "") return false;
  const t = (memberData?.type ?? "").toLowerCase();
  if (t === "adult" || t === "family") return false;
  const age = memberData?.age_months;
  if (age == null || !Number.isFinite(Number(age))) return false;
  const a = Math.max(0, Math.round(Number(age)));
  return a >= 4 && a < 12;
}

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

/** С 7 мес: при пустых «введённых» допускаем одну новинку + овощи из стартовой тройки (каталог 7–8 мес). */
export const EXTENDED_START_MIN_AGE_MONTHS = 7;

function validateNovelChickenEggRules(
  novel: string,
  canonicalKeys: string[],
  novelKeys: string[]
): InfantRecipeValidityResult | null {
  if (novel === "chicken") {
    if (!canonicalKeys.includes("chicken")) {
      return {
        valid: false,
        reason: "after_chicken_intro_recipe_must_contain_chicken",
        canonicalKeys,
        novelKeys,
      };
    }
    if (canonicalKeys.includes("egg")) {
      return {
        valid: false,
        reason: "after_chicken_intro_recipe_must_not_contain_egg",
        canonicalKeys,
        novelKeys,
      };
    }
  }
  if (novel === "egg") {
    if (!canonicalKeys.includes("egg")) {
      return {
        valid: false,
        reason: "after_egg_intro_recipe_must_contain_egg",
        canonicalKeys,
        novelKeys,
      };
    }
    if (canonicalKeys.includes("chicken")) {
      return {
        valid: false,
        reason: "after_egg_intro_recipe_must_not_contain_chicken",
        canonicalKeys,
        novelKeys,
      };
    }
  }
  return null;
}

/**
 * Блок «Сегодня можно попробовать» (primary): 4–6 мес без введённых — одна стартовая тройка;
 * 7–11 мес без введённых — одна новинка (+ опционально кабачок/брокколи/цветная капуста);
 * после отметки введённых — ровно один новый продукт, остальные только из введённых.
 */
export function evaluateInfantRecipeComplementaryRules(
  ingredients: IngredientForProductKey[] | null | undefined,
  introducedProductKeys: string[],
  meta?: InfantRecipeTextMeta | null,
  ageMonths?: number | null
): InfantRecipeValidityResult {
  const introduced = introducedProductKeys.filter(Boolean);
  const introducedSet = new Set(introduced);
  const canonicalKeys = mergeCanonicalProductKeys(ingredients, meta);
  const novelKeys = canonicalKeys.filter((k) => !introducedSet.has(k));
  const ageM =
    ageMonths != null && Number.isFinite(Number(ageMonths))
      ? Math.max(0, Math.round(Number(ageMonths)))
      : null;

  if (introduced.length === 0) {
    if (hasNonTechnicalFoodRowWithoutProductKey(ingredients)) {
      return {
        valid: false,
        reason: "start_unrecognized_food_row",
        canonicalKeys,
        novelKeys,
      };
    }

    if (ageM != null && ageM >= EXTENDED_START_MIN_AGE_MONTHS) {
      const novelExcludingStart = canonicalKeys.filter((k) => !ALLOWED_START_PRODUCT_KEYS.has(k));
      if (novelExcludingStart.length === 0) {
        if (canonicalKeys.length === 1 && ALLOWED_START_PRODUCT_KEYS.has(canonicalKeys[0])) {
          return { valid: true, reason: "start_ok", canonicalKeys, novelKeys };
        }
        return {
          valid: false,
          reason: canonicalKeys.length === 0 ? "start_no_recognized_product" : "start_multiple_keys",
          canonicalKeys,
          novelKeys,
        };
      }
      if (novelExcludingStart.length !== 1) {
        return {
          valid: false,
          reason: "extended_start_multiple_novel",
          canonicalKeys,
          novelKeys,
        };
      }
      const eggCheck = validateNovelChickenEggRules(novelExcludingStart[0], canonicalKeys, novelKeys);
      if (eggCheck) return eggCheck;
      return { valid: true, reason: "extended_start_ok", canonicalKeys, novelKeys };
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
  const novel = novelKeys[0];
  const eggCheck = validateNovelChickenEggRules(novel, canonicalKeys, novelKeys);
  if (eggCheck) return eggCheck;
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
