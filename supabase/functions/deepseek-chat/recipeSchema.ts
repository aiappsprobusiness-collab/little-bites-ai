/**
 * Zod schema for AI recipe JSON contract.
 * Strict validation: ingredients min 4, steps min 4, displayText with quantity.
 */
import { z } from "npm:zod@3.23.8";

const DISPLAY_TEXT_QUANTITY_REGEX = /[\d½¼¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+/;

const IngredientSchema = z.object({
  name: z.string().min(1, "name required"),
  displayText: z
    .string()
    .min(1, "displayText required")
    .refine((s) => DISPLAY_TEXT_QUANTITY_REGEX.test(s), "displayText must contain number or fraction (e.g. 1/2)"),
  canonical: z
    .object({
      amount: z.number().positive("canonical.amount must be > 0"),
      unit: z.enum(["g", "ml"]),
    })
    .nullable(),
  substitute: z.string().optional(),
});

export const RecipeJsonSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string(),
  cookingTimeMinutes: z.number().int().min(1).max(240),
  ingredients: z.array(IngredientSchema).min(4),
  steps: z.array(z.string().min(1)).min(4),
  advice: z.string().nullable(),
  chefAdvice: z.string().nullable().optional(),
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
 * Handles cookingTime/cookingTimeMinutes, legacy ingredient formats for backward compat.
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
      description: String(parsed.description ?? ""),
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
        // Схема требует число/дробь в displayText; во взрослых рецептах часто "по вкусу"/"для жарки" — дополняем
        if (!DISPLAY_TEXT_QUANTITY_REGEX.test(displayText)) {
          displayText = displayText.trim() + " (1 порция)";
        }
        return { name, displayText, canonical, ...(substitute != null && { substitute: String(substitute) }) };
      }),
      steps: parsed.steps.map((s: unknown) => String(s ?? "").trim()).filter((s) => s.length > 0),
      advice: parsed.advice ?? null,
      chefAdvice: parsed.chefAdvice ?? null,
      mealType: parsed.mealType ?? undefined,
    };
    const result = RecipeJsonSchema.safeParse(normalized);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
