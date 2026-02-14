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

export const RecipeJsonSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(200),
  cookingTime: z.number().int().min(1).max(240).optional(),
  cookingTimeMinutes: z.number().int().min(1).max(240).optional(),
  ingredients: z.array(IngredientSchema).min(1),
  steps: z.array(z.string().min(1)).min(1).max(7),
  advice: z.string().nullable().optional(),
  chefAdvice: z.string().max(300).nullable().optional(),
  mealType: z.enum(["breakfast", "lunch", "snack", "dinner"]).optional(),
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
  return null;
}

/**
 * Validates AI response. Returns parsed RecipeJson or null if invalid.
 * Handles new contract (name + amount) and legacy (displayText, canonical). Normalizes to internal shape.
 */
export function validateRecipeJson(assistantMessage: string): RecipeJson | null {
  const jsonStr = extractJsonFromResponse(assistantMessage);
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed.title || !Array.isArray(parsed.ingredients) || !Array.isArray(parsed.steps)) return null;
    const cooking = parsed.cookingTimeMinutes ?? parsed.cookingTime;
    const normalized = {
      title: String(parsed.title).trim(),
      description: String(parsed.description ?? "").slice(0, 200),
      cookingTimeMinutes: typeof cooking === "number" ? Math.max(1, Math.min(240, Math.floor(cooking))) : 1,
      ingredients: parsed.ingredients.map((ing: unknown) => {
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
      steps: parsed.steps
        .map((s: unknown) => String(s ?? "").trim())
        .filter((s) => s.length > 0)
        .slice(0, 7),
      advice: parsed.advice ?? null,
      chefAdvice: (parsed.chefAdvice ?? parsed.chef_advice ?? parsed.chefAdviceText) != null
        ? String(parsed.chefAdvice ?? parsed.chef_advice ?? parsed.chefAdviceText).slice(0, 300)
        : null,
      mealType: parsed.mealType ?? undefined,
    };
    const result = RecipeJsonSchema.safeParse(normalized);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
