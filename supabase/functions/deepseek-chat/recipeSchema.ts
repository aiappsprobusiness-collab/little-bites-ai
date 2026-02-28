/**
 * Zod schema for AI recipe JSON contract.
 * Supports both new contract (name + amount) and legacy (name + displayText + canonical).
 */
import { z } from "npm:zod@3.23.8";

const DISPLAY_TEXT_QUANTITY_REGEX = /[\d½¼¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+/;

/** Units/patterns that indicate quantitative amount (г, мл, шт, ст.л, ч.л, кг, л, etc.). */
const QUANTITY_UNIT_PATTERN = /\b(г|мл|шт|кг|л|ст\.?\s*л\.?|ч\.?\s*л\.?|столов|чайн|грамм|миллилитр|штук|порци)\b|\d+\s*(г|мл|шт|кг|л)/i;

/**
 * Do NOT add "(1 порция)" when displayText is qualitative or already has parens.
 *
 * Examples (see assertIngredientDisplayExamples() below):
 *   1) "Соль — по вкусу" → omit suffix (no "(1 порция)").
 *   2) "Зелень — для подачи" → omit suffix.
 *   3) "Киноа — 100 г" → has number, so suffix is never added; display stays as-is.
 */
function shouldOmitPortionSuffix(displayText: string): boolean {
  const t = displayText.trim();
  if (t.length === 0) return true;
  if (/по вкусу/i.test(t)) return true;
  if (t.includes("для подачи")) return true;
  if (t.includes("(")) return true;
  const hasNumber = DISPLAY_TEXT_QUANTITY_REGEX.test(t);
  const hasUnit = QUANTITY_UNIT_PATTERN.test(t);
  if (!hasNumber && !hasUnit) return true;
  return false;
}

/** Asserts the 3 ingredient display examples. Call from tests or manually. */
export function assertIngredientDisplayExamples(): void {
  if (shouldOmitPortionSuffix("Соль — по вкусу") !== true) throw new Error("Example 1: Соль — по вкусу must omit suffix");
  if (shouldOmitPortionSuffix("Зелень — для подачи") !== true) throw new Error("Example 2: Зелень — для подачи must omit suffix");
  if (!DISPLAY_TEXT_QUANTITY_REGEX.test("Киноа — 100 г")) throw new Error("Example 3: Киноа — 100 г must have number (no suffix added)");
}

const IngredientSchema = z.object({
  name: z.string().min(1, "name required"),
  amount: z.string().optional(),
  displayText: z.string().optional(),
  canonical: z
    .object({
      amount: z.number().positive("canonical.amount must be > 0"),
      unit: z.enum(["g", "ml"]),
    })
    .nullable()
    .optional(),
  substitute: z.string().optional(),
});

/** Returns true if we should ask AI to retry with amounts (ingredients missing quantity/unit). */
export function ingredientsNeedAmountRetry(ingredients: Array<{ name?: string; amount?: string; displayText?: string }>): boolean {
  if (!Array.isArray(ingredients) || ingredients.length < 3) return true;
  for (const ing of ingredients) {
    const amount = (ing.amount ?? "").trim();
    const displayText = (ing.displayText ?? "").trim();
    const hasAmountUnit = amount.length > 0 && (QUANTITY_UNIT_PATTERN.test(amount) || DISPLAY_TEXT_QUANTITY_REGEX.test(amount));
    const displayHasQuantity = displayText.length > 0 && (QUANTITY_UNIT_PATTERN.test(displayText) || (DISPLAY_TEXT_QUANTITY_REGEX.test(displayText) && /г|мл|шт|ст\.|ч\.|кг|л/i.test(displayText)));
    const qualitative = /по вкусу|для подачи/i.test(displayText) || /по вкусу|для подачи/i.test(amount);
    if (!hasAmountUnit && !displayHasQuantity && !qualitative) return true;
  }
  return false;
}

/** Default unit by product type: liquids -> ml, countables -> шт, else г. */
function defaultUnitForName(name: string): string {
  const n = (name ?? "").toLowerCase();
  if (/\b(молоко|вода|масло|бульон|кефир|йогурт|сливки|сок|компот|чай|кофе)\b/.test(n) || /мл|литр|л\b/.test(n)) return "мл";
  if (/\b(яйц|яйко|банан|груша|яблоко|апельсин|луковиц|зубчик|головк|ломтик|кусок|шт)\b/.test(n) || /штук|штуки/.test(n)) return "шт";
  return "г";
}

/**
 * Apply fallback when amount/unit are missing: set amount "1", unit "шт" or "г"/"мл" by product type.
 * Mutates ingredients in place (displayText, canonical).
 */
export function applyIngredientsFallbackHeuristic(
  ingredients: Array<Record<string, unknown> & { name?: string; amount?: string; displayText?: string; canonical?: { amount: number; unit: string } | null }>
): void {
  if (!Array.isArray(ingredients)) return;
  for (const ing of ingredients) {
    const name = (ing?.name ?? "").trim() || "Ингредиент";
    const amountStr = (ing.amount ?? "").trim();
    const displayTextRaw = (ing.displayText ?? "").trim();
    const hasQ = amountStr.length > 0 && (QUANTITY_UNIT_PATTERN.test(amountStr) || DISPLAY_TEXT_QUANTITY_REGEX.test(amountStr));
    const displayHasQ = displayTextRaw.length > 0 && (QUANTITY_UNIT_PATTERN.test(displayTextRaw) || DISPLAY_TEXT_QUANTITY_REGEX.test(displayTextRaw));
    const qualitative = /по вкусу|для подачи/i.test(displayTextRaw) || /по вкусу|для подачи/i.test(amountStr);
    if (hasQ || displayHasQ || qualitative) continue;
    const unit = defaultUnitForName(name);
    ing.displayText = `${name} — 1 ${unit}`;
    ing.canonical = { amount: 1, unit: unit === "мл" ? "ml" : "g" };
  }
}

/** Optional nutrition: per serving. If missing or invalid we set null, do not fail recipe. */
const NutritionSchema = z.object({
  kcal_per_serving: z.number().min(30).max(900),
  protein_g_per_serving: z.number().min(0).max(100),
  fat_g_per_serving: z.number().min(0).max(100),
  carbs_g_per_serving: z.number().min(0).max(150),
  is_estimate: z.literal(true).optional(),
}).nullable().optional();

/** Contract: title, description (2–4 sentences, max 500), ingredients (max 10), steps (max 10, each ≤200), cookingTime, mealType, servings, chefAdvice (max 400), nutrition optional. */
export const RecipeJsonSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500),
  cookingTime: z.number().int().min(1).max(240).optional(),
  cookingTimeMinutes: z.number().int().min(1).max(240).optional(),
  ingredients: z.array(IngredientSchema).min(3, "at least 3 ingredients required").max(10),
  steps: z.array(z.string().min(1).max(200)).min(1).max(10),
  chefAdvice: z.string().max(400).nullable().optional(),
  mealType: z.enum(["breakfast", "lunch", "snack", "dinner"]).optional(),
  servings: z.number().int().min(1).max(20).optional(),
  nutrition: NutritionSchema,
});

export type RecipeJson = z.infer<typeof RecipeJsonSchema>;

function extractJsonFromResponse(text: string): string | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let quote = "";
  for (let j = start; j < trimmed.length; j++) {
    const c = trimmed[j];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return trimmed.slice(start, j + 1);
    }
  }
  if (depth > 0 && trimmed.length > 100) {
    let repaired = trimmed.slice(start);
    if (inString) repaired += quote;
    for (let i = 0; i < depth; i++) repaired += "}";
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Parses and validates already-extracted JSON string (e.g. after extractJsonObject + normalizeQuotes).
 * Use from Edge with validateRecipe pipeline; preserves nutrition (KBJU).
 */
export function parseAndValidateRecipeJsonFromString(jsonStr: string): RecipeJson | null {
  if (!jsonStr || typeof jsonStr !== "string") return null;
  try {
    let parsed: unknown = JSON.parse(jsonStr);
    // Если модель вернула массив рецептов — берём первый, остальные игнорируем
    if (Array.isArray(parsed) && parsed.length > 0) {
      parsed = parsed[0];
    } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { recipes?: unknown[] }).recipes)) {
      const arr = (parsed as { recipes: unknown[] }).recipes;
      if (arr.length > 0) parsed = arr[0];
    }
    if (!parsed || typeof parsed !== "object" || !("title" in parsed) || !Array.isArray((parsed as { ingredients?: unknown }).ingredients) || !Array.isArray((parsed as { steps?: unknown }).steps))
      return null;
    const p = parsed as Record<string, unknown> & {
      title?: string; description?: string; cookingTimeMinutes?: number; cookingTime?: number;
      ingredients: unknown[]; steps: unknown[]; chefAdvice?: string; chef_advice?: string; chefAdviceText?: string; mealType?: string;
      nutrition?: { kcal_per_serving?: number; protein_g_per_serving?: number; fat_g_per_serving?: number; carbs_g_per_serving?: number; is_estimate?: boolean } | null;
    };
    const cooking = p.cookingTimeMinutes ?? p.cookingTime;
    let nutritionNorm: { kcal_per_serving: number; protein_g_per_serving: number; fat_g_per_serving: number; carbs_g_per_serving: number; is_estimate: true } | null = null;
    if (p.nutrition && typeof p.nutrition === "object") {
      const n = p.nutrition as Record<string, unknown>;
      const kcal = typeof n.kcal_per_serving === "number" ? n.kcal_per_serving : Number(n.kcal_per_serving);
      const protein = typeof n.protein_g_per_serving === "number" ? n.protein_g_per_serving : Number(n.protein_g_per_serving);
      const fat = typeof n.fat_g_per_serving === "number" ? n.fat_g_per_serving : Number(n.fat_g_per_serving);
      const carbs = typeof n.carbs_g_per_serving === "number" ? n.carbs_g_per_serving : Number(n.carbs_g_per_serving);
      if (Number.isFinite(kcal) && kcal >= 30 && kcal <= 900 && Number.isFinite(protein) && protein >= 0 && protein <= 100 &&
          Number.isFinite(fat) && fat >= 0 && fat <= 100 && Number.isFinite(carbs) && carbs >= 0 && carbs <= 150) {
        nutritionNorm = {
          kcal_per_serving: Math.round(kcal * 10) / 10,
          protein_g_per_serving: Math.round(protein * 10) / 10,
          fat_g_per_serving: Math.round(fat * 10) / 10,
          carbs_g_per_serving: Math.round(carbs * 10) / 10,
          is_estimate: true,
        };
      }
    }
    const normalized = {
      title: String(p.title).trim(),
      description: String(p.description ?? "").slice(0, 500),
      cookingTimeMinutes: typeof cooking === "number" ? Math.max(1, Math.min(240, Math.floor(cooking))) : 1,
      ingredients: p.ingredients.slice(0, 10).map((ing: unknown) => {
        let name: string;
        let displayText: string;
        let canonical: { amount: number; unit: string } | null = null;
        let substitute: string | undefined;
        if (typeof ing === "string") {
          name = ing;
          displayText = ing;
        } else if (ing && typeof ing === "object" && "name" in ing) {
          const o = ing as { name: string; displayText?: string; amount?: string; canonical?: { amount: number; unit: string } | null; substitute?: string };
          name = o.name;
          displayText = o.displayText ?? (o.amount ? `${o.name} — ${o.amount}` : o.name);
          canonical = o.canonical ?? null;
          substitute = o.substitute;
        } else {
          name = String(ing);
          displayText = String(ing);
        }
        if (!DISPLAY_TEXT_QUANTITY_REGEX.test(displayText) && !shouldOmitPortionSuffix(displayText)) {
          displayText = displayText.trim() + " (1 порция)";
        }
        return { name, displayText, canonical, ...(substitute != null && { substitute: String(substitute) }) };
      }),
      steps: p.steps
        .map((s: unknown) => String(s ?? "").trim().slice(0, 200))
        .filter((s) => s.length > 0)
        .slice(0, 10),
      chefAdvice: (p.chefAdvice ?? p.chef_advice ?? p.chefAdviceText) != null
        ? String(p.chefAdvice ?? p.chef_advice ?? p.chefAdviceText).slice(0, 400)
        : null,
      mealType: p.mealType ?? undefined,
      nutrition: nutritionNorm,
    };
    const result = RecipeJsonSchema.safeParse(normalized);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Validates AI response. Returns parsed RecipeJson or null if invalid.
 * Handles new contract (name + amount) and legacy (displayText, canonical). Normalizes to internal shape. Preserves nutrition (KBJU).
 */
export function validateRecipeJson(assistantMessage: string): RecipeJson | null {
  const jsonStr = extractJsonFromResponse(assistantMessage);
  if (!jsonStr) return null;
  return parseAndValidateRecipeJsonFromString(jsonStr);
}
