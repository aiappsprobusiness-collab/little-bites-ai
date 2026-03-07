/**
 * Zod schema for AI recipe JSON contract.
 * Supports both new contract (name + amount) and legacy (name + displayText + canonical).
 */
import { z } from "npm:zod@3.23.8";

const DISPLAY_TEXT_QUANTITY_REGEX = /[\d½¼¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+/;
const MEAL_TYPE_VALUES = ["breakfast", "lunch", "snack", "dinner"] as const;
const RECIPE_MEAL_TYPE_MAP: Record<string, (typeof MEAL_TYPE_VALUES)[number]> = {
  breakfast: "breakfast",
  lunch: "lunch",
  snack: "snack",
  dinner: "dinner",
  "завтрак": "breakfast",
  "обед": "lunch",
  "перекус": "snack",
  "полдник": "snack",
  "ужин": "dinner",
};

export type RecipeMealType = (typeof MEAL_TYPE_VALUES)[number];

export interface ValidationIssueDetail {
  path: unknown[];
  message: string;
}

export interface RecipeParseDiagnostics {
  localRepairApplied: boolean;
  repairedFields: string[];
  validationDetails: ValidationIssueDetail[];
  localRepairReason: string | null;
  rawMealType: string | null;
  normalizedMealType: string | null;
  localRepairMs: number;
}

export interface RecipeRecoveryDecision {
  strategy: "none" | "llm_retry" | "fail_fast";
  reason: string;
}

const EMPTY_PARSE_DIAGNOSTICS: RecipeParseDiagnostics = {
  localRepairApplied: false,
  repairedFields: [],
  validationDetails: [],
  localRepairReason: null,
  rawMealType: null,
  normalizedMealType: null,
  localRepairMs: 0,
};

function cloneDiagnostics(diag: RecipeParseDiagnostics): RecipeParseDiagnostics {
  return {
    localRepairApplied: diag.localRepairApplied,
    repairedFields: [...diag.repairedFields],
    validationDetails: diag.validationDetails.map((d) => ({ path: [...d.path], message: d.message })),
    localRepairReason: diag.localRepairReason,
    rawMealType: diag.rawMealType,
    normalizedMealType: diag.normalizedMealType,
    localRepairMs: diag.localRepairMs,
  };
}

function collapseSpaces(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeMealTypeValue(raw: unknown): RecipeMealType | null {
  if (typeof raw !== "string") return null;
  const normalized = collapseSpaces(raw);
  if (!normalized) return null;
  return RECIPE_MEAL_TYPE_MAP[normalized] ?? null;
}

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
  is_estimate: z.boolean().optional(),
}).nullable().optional();

function parseNutritionNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return Number.NaN;
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  const direct = Number(trimmed.replace(",", "."));
  if (Number.isFinite(direct)) return direct;
  const match = trimmed.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return Number.NaN;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** Normalize raw nutrition from model (may use calories/protein/fat/carbs). Return null if invalid. */
function normalizeNutrition(raw: unknown): { kcal_per_serving: number; protein_g_per_serving: number; fat_g_per_serving: number; carbs_g_per_serving: number; is_estimate: true } | null {
  if (raw == null || typeof raw !== "object") return null;
  const n = raw as Record<string, unknown>;
  const kcal = n.kcal_per_serving ?? n.calories ?? n.kcal;
  const protein = n.protein_g_per_serving ?? n.protein ?? n.proteins;
  const fat = n.fat_g_per_serving ?? n.fat ?? n.fats;
  const carbs = n.carbs_g_per_serving ?? n.carbs ?? n.carbohydrates;
  const k = parseNutritionNumber(kcal);
  const p = parseNutritionNumber(protein);
  const f = parseNutritionNumber(fat);
  const c = parseNutritionNumber(carbs);
  if (!(k >= 30 && k <= 900 && p >= 0 && p <= 100 && f >= 0 && f <= 100 && c >= 0 && c <= 150)) {
    console.log(JSON.stringify({
      tag: "NUTRITION_DROPPED",
      reason: "invalid_or_out_of_range",
      rawNutrition: raw,
      extracted: {
        kcal: kcal ?? null,
        protein: protein ?? null,
        fat: fat ?? null,
        carbs: carbs ?? null,
      },
      parsed: {
        kcal: Number.isFinite(k) ? k : null,
        protein: Number.isFinite(p) ? p : null,
        fat: Number.isFinite(f) ? f : null,
        carbs: Number.isFinite(c) ? c : null,
      },
    }));
    return null;
  }
  return {
    kcal_per_serving: Math.round(k * 10) / 10,
    protein_g_per_serving: Math.round(p * 10) / 10,
    fat_g_per_serving: Math.round(f * 10) / 10,
    carbs_g_per_serving: Math.round(c * 10) / 10,
    is_estimate: true,
  };
}

/** Contract: title, description (1–2 sentences, max 170), ingredients (max 10), steps (max 10, each ≤200), cookingTime, mealType, servings, chefAdvice (2–3 sentences, max 280), nutrition optional. */
export const RecipeJsonSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(170, "description: 1–2 sentences, max 170 characters"),
  cookingTime: z.number().int().min(1).max(240).optional(),
  cookingTimeMinutes: z.number().int().min(1).max(240).optional(),
  ingredients: z.array(IngredientSchema).min(3, "at least 3 ingredients required").max(10),
  steps: z.array(z.string().min(1).max(200)).min(1).max(10),
  chefAdvice: z.string().max(280, "chefAdvice: 2–3 sentences, max 280 characters").nullable().optional(),
  mealType: z.enum(MEAL_TYPE_VALUES),
  servings: z.number().int().min(1).max(20).optional(),
  nutrition: NutritionSchema,
});

export type RecipeJson = z.infer<typeof RecipeJsonSchema>;

let lastValidationError: string | null = null;
let lastParseDiagnostics: RecipeParseDiagnostics = cloneDiagnostics(EMPTY_PARSE_DIAGNOSTICS);

/** Last validation error message (e.g. for retryFixJson). Reset on successful parse. */
export function getLastValidationError(): string | null {
  return lastValidationError;
}

export function getLastRecipeParseDiagnostics(): RecipeParseDiagnostics {
  return cloneDiagnostics(lastParseDiagnostics);
}

function setLastParseDiagnostics(diag: RecipeParseDiagnostics): void {
  lastParseDiagnostics = cloneDiagnostics(diag);
}

export function resetLastRecipeValidationState(): void {
  lastValidationError = null;
  setLastParseDiagnostics(EMPTY_PARSE_DIAGNOSTICS);
}

export function decideRecipeRecovery(stage: "ok" | "extract" | "parse" | "validate", diagnostics?: RecipeParseDiagnostics | null): RecipeRecoveryDecision {
  if (stage === "ok") return { strategy: "none", reason: "already_valid" };
  if (stage === "extract") return { strategy: "llm_retry", reason: "json_extract_failed" };
  if (stage === "parse") return { strategy: "llm_retry", reason: "json_parse_failed" };

  const details = diagnostics?.validationDetails ?? [];
  const mealTypeOnly = details.length > 0 && details.every((d) => d.path.length > 0 && String(d.path[0]) === "mealType");
  if (mealTypeOnly) {
    return {
      strategy: "fail_fast",
      reason: diagnostics?.rawMealType ? "unsupported_meal_type" : "missing_meal_type",
    };
  }

  const structuralPaths = new Set(["title", "ingredients", "steps"]);
  if (details.some((d) => d.path.length > 0 && structuralPaths.has(String(d.path[0])))) {
    return { strategy: "llm_retry", reason: "recipe_structure_invalid" };
  }

  return { strategy: "llm_retry", reason: "schema_validation_failed_after_local_repair" };
}

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
  if (!jsonStr || typeof jsonStr !== "string") {
    resetLastRecipeValidationState();
    return null;
  }
  try {
    let parsed: unknown = JSON.parse(jsonStr);
    // Если модель вернула массив рецептов — берём первый, остальные игнорируем
    if (Array.isArray(parsed) && parsed.length > 0) {
      parsed = parsed[0];
    } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { recipes?: unknown[] }).recipes)) {
      const arr = (parsed as { recipes: unknown[] }).recipes;
      if (arr.length > 0) parsed = arr[0];
    }
    if (!parsed || typeof parsed !== "object" || !("title" in parsed) || !Array.isArray((parsed as { ingredients?: unknown }).ingredients) || !Array.isArray((parsed as { steps?: unknown }).steps)) {
      const details: ValidationIssueDetail[] = [];
      if (!parsed || typeof parsed !== "object" || !("title" in parsed)) {
        details.push({ path: ["title"], message: "title is required" });
      }
      if (!Array.isArray((parsed as { ingredients?: unknown }).ingredients)) {
        details.push({ path: ["ingredients"], message: "ingredients must be an array" });
      }
      if (!Array.isArray((parsed as { steps?: unknown }).steps)) {
        details.push({ path: ["steps"], message: "steps must be an array" });
      }
      lastValidationError = details.map((d) => `${d.path.join(".")}: ${d.message}`).join("; ") || "recipe structure invalid";
      setLastParseDiagnostics({
        localRepairApplied: false,
        repairedFields: [],
        validationDetails: details,
        localRepairReason: null,
        rawMealType: null,
        normalizedMealType: null,
        localRepairMs: 0,
      });
      console.log(JSON.stringify({ tag: "VALIDATION_ERROR_DETAILS", details }));
      return null;
    }
    const p = parsed as Record<string, unknown> & {
      title?: string; description?: string; cookingTimeMinutes?: number; cookingTime?: number;
      ingredients: unknown[]; steps: unknown[]; chefAdvice?: string; chef_advice?: string; chefAdviceText?: string; mealType?: string;
      servings?: number;
      nutrition?: unknown;
    };
    const repairStartedAt = Date.now();
    const rawMealType = typeof p.mealType === "string" ? p.mealType : null;
    const collapsedMealType = typeof p.mealType === "string" ? collapseSpaces(p.mealType) : null;
    const normalizedMealType = normalizeMealTypeValue(p.mealType);
    const repairedFields: string[] = [];
    let localRepairReason: string | null = null;
    if (rawMealType && normalizedMealType && normalizedMealType !== rawMealType) {
      repairedFields.push("mealType");
      localRepairReason = "mealType_normalized";
    }
    const localRepairMs = Date.now() - repairStartedAt;
    const cookingRaw = p.cookingTimeMinutes ?? p.cookingTime;
    const cooking = typeof cookingRaw === "number" && Number.isFinite(cookingRaw)
      ? Math.max(1, Math.min(240, Math.floor(cookingRaw)))
      : typeof cookingRaw === "string" ? Math.max(1, Math.min(240, parseInt(cookingRaw, 10) || 15)) : 15;
    const servingsRaw = p.servings;
    const servings = typeof servingsRaw === "number" && Number.isFinite(servingsRaw) && servingsRaw >= 1
      ? Math.min(20, Math.floor(servingsRaw))
      : typeof servingsRaw === "string" ? Math.max(1, parseInt(servingsRaw, 10) || 1) : 1;
    const nutritionNorm = normalizeNutrition(p.nutrition);
    const normalized = {
      title: String(p.title).trim(),
      description: String(p.description ?? "").slice(0, 170),
      cookingTimeMinutes: cooking,
      ingredients: p.ingredients.slice(0, 10).map((ing: unknown) => {
        let name: string;
        let displayText: string;
        let amount: string;
        let canonical: { amount: number; unit: string } | null = null;
        let substitute: string | undefined;
        if (typeof ing === "string") {
          name = ing;
          displayText = ing;
          amount = ing;
        } else if (ing && typeof ing === "object" && "name" in ing) {
          const o = ing as { name: string; displayText?: string; amount?: string | number; canonical?: { amount: number; unit: string } | null; substitute?: string };
          name = o.name;
          amount = o.amount != null ? String(o.amount) : (o.displayText ?? (o.amount != null ? `${o.name} — ${o.amount}` : o.name));
          displayText = o.displayText ?? (amount ? `${o.name} — ${amount}` : o.name);
          canonical = o.canonical ?? null;
          substitute = o.substitute;
        } else {
          name = String(ing);
          displayText = String(ing);
          amount = String(ing);
        }
        if (!DISPLAY_TEXT_QUANTITY_REGEX.test(displayText) && !shouldOmitPortionSuffix(displayText)) {
          displayText = displayText.trim() + " (1 порция)";
        }
        return { name, amount, displayText, canonical, ...(substitute != null && { substitute: String(substitute) }) };
      }),
      steps: p.steps
        .map((s: unknown) => String(s ?? "").trim().slice(0, 200))
        .filter((s) => s.length > 0)
        .slice(0, 10),
      chefAdvice: (p.chefAdvice ?? p.chef_advice ?? p.chefAdviceText) != null
        ? String(p.chefAdvice ?? p.chef_advice ?? p.chefAdviceText).slice(0, 280)
        : null,
      mealType: normalizedMealType ?? collapsedMealType ?? undefined,
      servings,
      nutrition: nutritionNorm,
    };
    setLastParseDiagnostics({
      localRepairApplied: repairedFields.length > 0,
      repairedFields,
      validationDetails: [],
      localRepairReason,
      rawMealType,
      normalizedMealType,
      localRepairMs,
    });
    let result = RecipeJsonSchema.safeParse(normalized);
    if (!result.success) {
      const err = result.error as { issues?: Array<{ path: unknown[]; message: string }> };
      const details = (err.issues ?? []).map((i) => ({ path: i.path, message: i.message }));
      const firstMessage = details[0]?.message ?? "schema validation failed";
      lastValidationError = details.map((d) => (d.path?.length ? `${d.path.join(".")}: ${d.message}` : d.message)).join("; ") || firstMessage;
      setLastParseDiagnostics({
        localRepairApplied: repairedFields.length > 0,
        repairedFields,
        validationDetails: details,
        localRepairReason,
        rawMealType,
        normalizedMealType,
        localRepairMs,
      });
      console.log(JSON.stringify({ tag: "VALIDATION_ERROR_DETAILS", details }));
      const fallbackNormalized = { ...normalized, nutrition: null };
      result = RecipeJsonSchema.safeParse(fallbackNormalized);
      if (result.success) {
        lastValidationError = null;
        setLastParseDiagnostics({
          localRepairApplied: repairedFields.length > 0,
          repairedFields,
          validationDetails: [],
          localRepairReason,
          rawMealType,
          normalizedMealType,
          localRepairMs,
        });
        return result.data;
      }
      const err2 = result.error as { issues?: Array<{ path: unknown[]; message: string }> };
      const fallbackDetails = (err2.issues ?? []).map((i) => ({ path: i.path, message: i.message }));
      lastValidationError = fallbackDetails.map((d) => (d.path?.length ? `${d.path.join(".")}: ${d.message}` : d.message)).join("; ") || firstMessage;
      setLastParseDiagnostics({
        localRepairApplied: repairedFields.length > 0,
        repairedFields,
        validationDetails: fallbackDetails,
        localRepairReason,
        rawMealType,
        normalizedMealType,
        localRepairMs,
      });
      console.log(JSON.stringify({ tag: "VALIDATION_ERROR_DETAILS_FALLBACK", details: fallbackDetails }));
      return null;
    }
    lastValidationError = null;
    setLastParseDiagnostics({
      localRepairApplied: repairedFields.length > 0,
      repairedFields,
      validationDetails: [],
      localRepairReason,
      rawMealType,
      normalizedMealType,
      localRepairMs,
    });
    return result.data;
  } catch {
    resetLastRecipeValidationState();
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

/** Minimal valid recipe for fallback when validation fails. nutrition = null. */
function getMinimalRecipeJson(options: { title?: string; ingredients?: unknown[]; steps?: unknown[] }): RecipeJson {
  const title = (options.title ?? "Рецепт").toString().trim() || "Рецепт";
  const rawIng = Array.isArray(options.ingredients) ? options.ingredients.slice(0, 10) : [];
  const ingredients = rawIng.length >= 3
    ? rawIng.map((ing: unknown) => {
        const o = ing && typeof ing === "object" && "name" in ing ? (ing as { name: string; amount?: string }) : null;
        const name = o?.name ? String(o.name) : "Ингредиент";
        const amount = o?.amount != null ? String(o.amount) : "по вкусу";
        return { name, amount, displayText: `${name} — ${amount}` };
      })
    : [
        { name: "Ингредиент 1", amount: "по вкусу", displayText: "Ингредиент 1 — по вкусу" },
        { name: "Ингредиент 2", amount: "по вкусу", displayText: "Ингредиент 2 — по вкусу" },
        { name: "Ингредиент 3", amount: "по вкусу", displayText: "Ингредиент 3 — по вкусу" },
      ];
  const rawSteps = Array.isArray(options.steps) ? options.steps : [];
  const steps = rawSteps.length >= 1
    ? rawSteps.map((s: unknown) => (typeof s === "string" ? s : (s && typeof s === "object" && "instruction" in s ? (s as { instruction?: string }).instruction : String(s)) ?? "Шаг").slice(0, 200)).filter((s: string) => s.length > 0).slice(0, 10)
    : ["Подготовьте ингредиенты и следуйте инструкции."];
  return {
    title,
    description: "Рецепт по вашему запросу. Уточните детали при необходимости.",
    cookingTimeMinutes: 15,
    ingredients,
    steps,
    mealType: "snack",
    servings: 1,
    chefAdvice: null,
    nutrition: null,
  };
}

/**
 * Returns validated recipe or a minimal fallback (nutrition = null) so the UI never gets a hard error.
 */
export function getRecipeOrFallback(assistantMessage: string): RecipeJson {
  const jsonStr = extractJsonFromResponse(assistantMessage);
  if (!jsonStr) return getMinimalRecipeJson({});
  const validated = parseAndValidateRecipeJsonFromString(jsonStr);
  if (validated) return validated;
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const title = parsed?.title != null ? String(parsed.title) : undefined;
    const ingredients = Array.isArray(parsed?.ingredients) ? parsed.ingredients : undefined;
    const steps = Array.isArray(parsed?.steps) ? parsed.steps : undefined;
    return getMinimalRecipeJson({ title, ingredients, steps });
  } catch {
    return getMinimalRecipeJson({});
  }
}
