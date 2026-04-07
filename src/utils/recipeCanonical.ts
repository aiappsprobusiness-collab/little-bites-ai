/**
 * Канонический формат рецепта для RPC create_recipe_with_steps.
 * Любой рецепт из Plan или Chat сохраняется с едиными правилами: meal_type, tags, source в POOL_SOURCES.
 */

import { inferCulturalFamiliarity } from "./inferCulturalFamiliarity";
import { enrichIngredientMeasurementForSave } from "@shared/ingredientMeasurementDisplay";
import { resolveCanonicalForEnrichFromIngredient } from "@shared/ingredientCanonicalForEnrich";

export const POOL_SOURCES = ["seed", "starter", "manual", "week_ai", "chat_ai"] as const;
export type PoolSource = (typeof POOL_SOURCES)[number];

const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

const TAG_MEAL_PREFIXES = ["chat_", "week_", "plan_"] as const;

function isMealType(s: string): s is MealType {
  return MEAL_TYPES.includes(s as MealType);
}

/** Из тега вида chat_breakfast / plan_lunch извлекает meal_type. */
function mealTypeFromTag(tag: string): MealType | null {
  const lower = tag.trim().toLowerCase();
  for (const prefix of TAG_MEAL_PREFIXES) {
    if (lower.startsWith(prefix)) {
      const rest = lower.slice(prefix.length);
      if (isMealType(rest)) return rest;
    }
  }
  return null;
}

/**
 * Приоритет: (a) mealType валидный → (b) из tags (*_breakfast/lunch/snack/dinner) → (c) contextMealType → (d) "snack".
 */
export function resolveMealType(options: {
  mealType?: string | null;
  tags?: string[] | null;
  contextMealType?: string | null;
}): MealType {
  const { mealType, tags, contextMealType } = options;
  if (mealType != null && mealType !== "" && isMealType(mealType)) return mealType;
  const tagsList = Array.isArray(tags) ? tags : [];
  for (const t of tagsList) {
    const fromTag = mealTypeFromTag(t);
    if (fromTag) return fromTag;
  }
  if (contextMealType != null && contextMealType !== "" && isMealType(contextMealType)) return contextMealType;
  return "snack";
}

/** sourceTag: "chat" | "plan" | "week_ai" в зависимости от контекста (для тегов). */
export type SourceTag = "chat" | "plan" | "week_ai";

/**
 * Теги: всегда массив, без дублей. Обязательно: sourceTag и `${sourceTag}_${meal_type}`.
 */
export function buildCanonicalTags(options: {
  sourceTag: SourceTag;
  meal_type: MealType;
  existingTags?: string[] | null;
}): string[] {
  const { sourceTag, meal_type, existingTags } = options;
  const base = [sourceTag, `${sourceTag}_${meal_type}`];
  const extra = Array.isArray(existingTags) ? existingTags.filter((t) => t != null && String(t).trim() !== "") : [];
  const combined = [...base, ...extra];
  return [...new Set(combined)];
}

/** Проверка: source входит в POOL_SOURCES; иначе возвращаем дефолт для AI. */
export function ensurePoolSource(source: string | null | undefined): PoolSource {
  if (source != null && source !== "" && (POOL_SOURCES as readonly string[]).includes(source)) return source as PoolSource;
  return "chat_ai";
}

export interface CanonicalStep {
  instruction: string;
  step_number?: number;
}

export interface CanonicalIngredient {
  name: string;
  display_text?: string | null;
  amount?: string | number | null;
  unit?: string | null;
  order_index?: number;
  category?: string;
  substitute?: string | null;
  canonical_amount?: number | null;
  canonical_unit?: string | null;
  display_amount?: number | null;
  display_unit?: string | null;
  display_quantity_text?: string | null;
  measurement_mode?: string | null;
}

export interface CanonicalizeRecipePayloadInput {
  user_id: string;
  member_id?: string | null;
  child_id?: string | null;
  source: string;
  /** Контекст слота при создании из Plan/replace_slot */
  contextMealType?: string | null;
  mealType?: string | null;
  tags?: string[] | null;
  title: string;
  description?: string | null;
  cooking_time_minutes?: number | null;
  calories?: number | null;
  proteins?: number | null;
  fats?: number | null;
  carbs?: number | null;
  chef_advice?: string | null;
  advice?: string | null;
  steps: CanonicalStep[] | Array<{ instruction: string; step_number?: number }>;
  ingredients: CanonicalIngredient[] | Array<Record<string, unknown>>;
  /** Для тегов: "chat" | "plan" | "week_ai". По умолчанию: chat_ai→chat, week_ai→week_ai. */
  sourceTag?: SourceTag;
  /** Явный признак супа для RPC (слот обед = только супы). При meal_type lunch по умолчанию true. */
  is_soup?: boolean | null;
  /** Stage 4 goals list. */
  nutrition_goals?: string[] | null;
  /** Stage 4.4: cuisine slug (not locale). */
  cuisine?: string | null;
  region?: string | null;
  /** Stage 4.4: if omitted, inferred from cuisine. */
  familiarity?: string | null;
  /** База порций: количества ингредиентов в payload за эти порции (RPC recipes.servings_base). */
  servings_base?: number | null;
  servings_recommended?: number | null;
}

/**
 * Возвращает payload для RPC create_recipe_with_steps в каноническом формате:
 * meal_type всегда заполнен, tags консистентны, source в POOL_SOURCES, steps/ingredients — массивы с минимальной валидацией.
 */
export function canonicalizeRecipePayload(input: CanonicalizeRecipePayloadInput): Record<string, unknown> {
  const {
    user_id,
    member_id,
    child_id,
    source,
    contextMealType,
    mealType,
    tags: rawTags,
    title,
    description,
    cooking_time_minutes,
    calories,
    proteins,
    fats,
    carbs,
    chef_advice,
    advice,
    steps: rawSteps,
    ingredients: rawIngredients,
    sourceTag: explicitSourceTag,
    nutrition_goals: rawNutritionGoals,
    cuisine: rawCuisine,
    region: rawRegion,
    familiarity: rawFamiliarity,
    servings_base: rawServingsBase,
    servings_recommended: rawServingsRecommended,
  } = input;

  const clampServings = (v: unknown, fallback: number): number => {
    const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.min(99, Math.floor(n)));
  };
  const servings_base = clampServings(rawServingsBase, 1);
  const servings_recommended = clampServings(rawServingsRecommended ?? rawServingsBase, servings_base);

  const meal_type = resolveMealType({ mealType, tags: rawTags, contextMealType });
  const safeSource = ensurePoolSource(source);

  const sourceTag: SourceTag =
    explicitSourceTag ??
    (safeSource === "week_ai" ? "week_ai" : safeSource === "chat_ai" ? "chat" : "chat");
  const tags = buildCanonicalTags({ sourceTag, meal_type, existingTags: rawTags });

  const steps = Array.isArray(rawSteps) ? rawSteps : [];
  if (steps.length === 0) {
    throw new Error("recipeCanonical: steps обязательны, минимум один шаг");
  }
  const stepsPayload = steps.map((s, i) => ({
    instruction: typeof (s as { instruction?: string }).instruction === "string" ? (s as { instruction: string }).instruction : "",
    step_number: (s as { step_number?: number }).step_number ?? i + 1,
  }));

  const ingredients = Array.isArray(rawIngredients) ? rawIngredients : [];
  const ingredientsPayload = ingredients.map((ing, idx) => {
    const name = typeof (ing as { name?: string }).name === "string" ? (ing as { name: string }).name : "";
    const amount = (ing as { amount?: string | number }).amount;
    const displayText = (ing as { display_text?: string }).display_text;
    const display_text =
      displayText != null && displayText !== ""
        ? displayText
        : amount != null && amount !== ""
          ? `${name} — ${amount}`
          : name;
    const unitVal = (ing as { unit?: string }).unit ?? null;
    const rawCanon = (ing as { canonical_amount?: number | string }).canonical_amount;
    const canonNum =
      rawCanon != null && String(rawCanon).trim() !== ""
        ? Number(String(rawCanon).replace(",", "."))
        : NaN;
    const canonical_amount_in = Number.isFinite(canonNum) ? canonNum : null;
    const canonical_unit_in =
      typeof (ing as { canonical_unit?: string }).canonical_unit === "string"
        ? (ing as { canonical_unit: string }).canonical_unit
        : null;
    const amtNum =
      amount != null && amount !== "" && String(amount).trim() !== "" && /^\d+\.?\d*$/.test(String(amount).trim())
        ? Number(String(amount).replace(",", "."))
        : null;

    const resolvedCanon = resolveCanonicalForEnrichFromIngredient({
      name,
      amount,
      unit: unitVal,
      display_text: display_text || name,
      canonical_amount: canonical_amount_in,
      canonical_unit: canonical_unit_in,
    });
    const canonical_amount = resolvedCanon?.amount ?? null;
    const canonical_unit = resolvedCanon?.unit ?? null;

    console.log("CANONICAL_BEFORE_ENRICH", {
      name,
      display_text: display_text || name,
      amount,
      unit: unitVal,
      canonical_amount,
      canonical_unit,
    });

    const enrichment = enrichIngredientMeasurementForSave({
      name,
      display_text: display_text || name,
      amount: amtNum,
      unit: unitVal,
      canonical_amount,
      canonical_unit,
      category: typeof (ing as { category?: string }).category === "string" ? (ing as { category: string }).category : null,
      display_amount: (ing as { display_amount?: number }).display_amount ?? null,
      display_unit: (ing as { display_unit?: string }).display_unit ?? null,
      display_quantity_text: (ing as { display_quantity_text?: string }).display_quantity_text ?? null,
      measurement_mode: (ing as { measurement_mode?: string }).measurement_mode as "canonical_only" | "dual" | "display_only" | null,
    });

    return {
      name,
      display_text: (enrichment.display_text ?? display_text) || name,
      amount: amount != null && amount !== "" ? amount : null,
      unit: unitVal,
      substitute: (ing as { substitute?: string }).substitute ?? null,
      canonical_amount,
      canonical_unit,
      order_index: (ing as { order_index?: number }).order_index ?? idx,
      category: (ing as { category?: string }).category ?? "other",
      display_amount: enrichment.display_amount,
      display_unit: enrichment.display_unit,
      display_quantity_text: enrichment.display_quantity_text,
      measurement_mode: enrichment.measurement_mode,
    };
  });

  if (ingredientsPayload.length < 3) {
    throw new Error("recipeCanonical: минимум 3 ингредиента требуются для create_recipe_with_steps");
  }

  const is_soup = meal_type === "lunch" ? true : (input.is_soup === true);

  const nutrition_goals = Array.isArray(rawNutritionGoals)
    ? [...new Set(rawNutritionGoals.filter((g) => typeof g === "string").map((g) => g.trim().toLowerCase()).filter(Boolean))]
    : [];

  const cuisineTrim =
    rawCuisine != null && String(rawCuisine).trim() !== "" ? String(rawCuisine).trim() : undefined;
  const regionTrim =
    rawRegion != null && String(rawRegion).trim() !== "" ? String(rawRegion).trim() : undefined;
  const familiarityExplicit =
    rawFamiliarity != null && String(rawFamiliarity).trim() !== ""
      ? String(rawFamiliarity).trim()
      : null;
  const familiarityResolved = familiarityExplicit ?? inferCulturalFamiliarity(cuisineTrim ?? null);

  return {
    user_id,
    member_id: member_id ?? null,
    child_id: child_id ?? member_id ?? null,
    source: safeSource,
    meal_type,
    tags,
    title: title || "Рецепт",
    description: description ?? "",
    cooking_time_minutes: cooking_time_minutes ?? null,
    calories: calories ?? null,
    proteins: proteins ?? null,
    fats: fats ?? null,
    carbs: carbs ?? null,
    chef_advice: chef_advice ?? null,
    advice: advice ?? null,
    steps: stepsPayload,
    ingredients: ingredientsPayload,
    is_soup,
    nutrition_goals,
    ...(cuisineTrim != null ? { cuisine: cuisineTrim } : {}),
    ...(regionTrim != null ? { region: regionTrim } : {}),
    familiarity: familiarityResolved,
    servings_base,
    servings_recommended,
  };
}
