/**
 * Edge: канонический формат рецепта для RPC create_recipe_with_steps.
 * Те же правила, что и в src/utils/recipeCanonical.ts: meal_type, tags, source в POOL_SOURCES.
 */

export const POOL_SOURCES = ["seed", "starter", "manual", "week_ai", "chat_ai"] as const;
type PoolSource = (typeof POOL_SOURCES)[number];

const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

const TAG_MEAL_PREFIXES = ["chat_", "week_", "plan_"] as const;

function isMealType(s: string): s is MealType {
  return MEAL_TYPES.includes(s as MealType);
}

function mealTypeFromTag(tag: string): MealType | null {
  const lower = String(tag).trim().toLowerCase();
  for (const prefix of TAG_MEAL_PREFIXES) {
    if (lower.startsWith(prefix)) {
      const rest = lower.slice(prefix.length);
      if (isMealType(rest)) return rest;
    }
  }
  return null;
}

/**
 * Приоритет для Plan-AI (sourceTag plan/week_ai): contextMealType всегда.
 * Иначе: (a) mealType валидный → (b) из tags → (c) contextMealType → (d) "snack".
 */
export function resolveMealType(options: {
  mealType?: string | null;
  tags?: string[] | null;
  contextMealType?: string | null;
  sourceTag?: SourceTag | string | null;
}): MealType {
  const { mealType, tags, contextMealType, sourceTag } = options;
  const fromPlan = sourceTag === "plan" || sourceTag === "week_ai";
  if (fromPlan && contextMealType != null && contextMealType !== "" && isMealType(contextMealType)) return contextMealType;
  if (mealType != null && mealType !== "" && isMealType(mealType)) return mealType;
  const tagsList = Array.isArray(tags) ? tags : [];
  for (const t of tagsList) {
    const fromTag = mealTypeFromTag(t);
    if (fromTag) return fromTag;
  }
  if (contextMealType != null && contextMealType !== "" && isMealType(contextMealType)) return contextMealType;
  return "snack";
}

export type SourceTag = "chat" | "plan" | "week_ai";

export function buildCanonicalTags(options: {
  sourceTag: SourceTag;
  meal_type: MealType;
  existingTags?: string[] | null;
}): string[] {
  const { sourceTag, meal_type, existingTags } = options;
  const base = [sourceTag, `${sourceTag}_${meal_type}`];
  const extra = Array.isArray(existingTags) ? existingTags.filter((t) => t != null && String(t).trim() !== "") : [];
  return [...new Set([...base, ...extra])];
}

export function ensurePoolSource(source: string | null | undefined): PoolSource {
  if (source != null && source !== "" && (POOL_SOURCES as readonly string[]).includes(source)) return source as PoolSource;
  return "chat_ai";
}

export interface CanonicalizeRecipePayloadInput {
  user_id: string;
  member_id?: string | null;
  child_id?: string | null;
  source: string;
  contextMealType?: string | null;
  mealType?: string | null;
  tags?: string[] | null;
  title: string;
  description?: string | null;
  cooking_time_minutes?: number | null;
  chef_advice?: string | null;
  advice?: string | null;
  steps: Array<{ instruction?: string; step_number?: number }>;
  ingredients: Array<Record<string, unknown> & { name?: string; amount?: string; display_text?: string }>;
  sourceTag?: SourceTag;
  /** Base serving count (default 1). */
  servings?: number | null;
  /** Nutrition per serving (from chat AI). If null, calories/proteins/fats/carbs not written. */
  nutrition?: {
    kcal_per_serving: number;
    protein_g_per_serving: number;
    fat_g_per_serving: number;
    carbs_g_per_serving: number;
  } | null;
  /** Explicit soup flag for create_recipe_with_steps. For lunch slot we set true if not provided. */
  is_soup?: boolean | null;
  /** Age range for plan/pool filtering. infant 6–12, toddler 12–60, school 60–216, adult 216–1200. */
  min_age_months?: number | null;
  max_age_months?: number | null;
  /** Stage 1: locale (e.g. 'ru'). RPC default 'ru' if omitted. */
  locale?: string | null;
  /** Stage 1: language of generated content. RPC keeps null if omitted. */
  source_lang?: string | null;
  /** Stage 1: trust level for pool. RPC derives from source if omitted. */
  trust_level?: string | null;
}

/**
 * Возвращает payload для RPC create_recipe_with_steps. steps пустой → throw.
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
    chef_advice,
    advice,
    steps: rawSteps,
    ingredients: rawIngredients,
    sourceTag: explicitSourceTag,
    servings,
    nutrition: rawNutrition,
    is_soup: rawIsSoup,
    min_age_months: rawMinAge,
    max_age_months: rawMaxAge,
    locale: rawLocale,
    source_lang: rawSourceLang,
    trust_level: rawTrustLevel,
  } = input;

  const safeSource = ensurePoolSource(source);
  const sourceTag: SourceTag = explicitSourceTag ?? (safeSource === "week_ai" ? "week_ai" : "chat");
  const meal_type = resolveMealType({ mealType, tags: rawTags, contextMealType, sourceTag });
  const tags = buildCanonicalTags({ sourceTag, meal_type, existingTags: rawTags });

  const steps = Array.isArray(rawSteps) ? rawSteps : [];
  if (steps.length === 0) {
    throw new Error("recipeCanonical: steps обязательны, минимум один шаг");
  }
  const stepsPayload = steps.map((s, i) => ({
    instruction: typeof s.instruction === "string" ? s.instruction : "",
    step_number: typeof s.step_number === "number" ? s.step_number : i + 1,
  }));

  const ingredients = Array.isArray(rawIngredients) ? rawIngredients : [];
  const numericOnly = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s !== "" && /^\d+\.?\d*$/.test(s) ? s : null;
  };
  const ingredientsPayload = ingredients.map((ing, idx) => {
    const name = typeof ing.name === "string" ? ing.name : "";
    const amountRaw = ing.amount;
    const amount = numericOnly(amountRaw);
    const displayText = ing.display_text;
    const display_text =
      displayText != null && displayText !== ""
        ? displayText
        : amountRaw != null && String(amountRaw).trim() !== ""
          ? `${name} — ${amountRaw}`
          : name;
    return {
      name,
      display_text: display_text || name,
      amount,
      unit: ing.unit ?? null,
      substitute: ing.substitute ?? null,
      canonical_amount: ing.canonical_amount ?? null,
      canonical_unit: ing.canonical_unit ?? null,
      order_index: typeof ing.order_index === "number" ? ing.order_index : idx,
      category: typeof ing.category === "string" ? ing.category : "other",
    };
  });

  if (ingredientsPayload.length < 3) {
    throw new Error("recipeCanonical: минимум 3 ингредиента требуются для create_recipe_with_steps");
  }

  const servings_base = (servings != null && servings >= 1 && servings <= 99) ? servings : 1;
  const servings_recommended =
    meal_type === "lunch" ? 3 : meal_type === "dinner" ? 2 : 1;

  /** Lunch slot => only soups; set is_soup for RPC so new recipes get recipes.is_soup = true. Assign to plan does not change recipe. */
  const is_soup = meal_type === "lunch" ? true : (rawIsSoup === true);

  const calories = rawNutrition != null ? Math.round(rawNutrition.kcal_per_serving) : null;
  const proteins = rawNutrition != null ? rawNutrition.protein_g_per_serving : null;
  const fats = rawNutrition != null ? rawNutrition.fat_g_per_serving : null;
  const carbs = rawNutrition != null ? rawNutrition.carbs_g_per_serving : null;

  const chefAdviceVal = chef_advice != null && String(chef_advice).trim() !== "" ? String(chef_advice).trim() : null;
  const adviceVal = advice != null && String(advice).trim() !== "" ? String(advice).trim() : null;
  const needsAdvice = (safeSource === "chat_ai" || safeSource === "week_ai" || safeSource === "manual")
    && !chefAdviceVal && !adviceVal;
  const finalChefAdvice = chefAdviceVal ?? (needsAdvice ? "Подавайте тёплым." : null);
  const finalAdvice = adviceVal ?? null;

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
    chef_advice: finalChefAdvice,
    advice: finalAdvice ?? null,
    steps: stepsPayload,
    ingredients: ingredientsPayload,
    servings_base,
    servings_recommended,
    is_soup,
    calories,
    proteins,
    fats,
    carbs,
    min_age_months: rawMinAge ?? null,
    max_age_months: rawMaxAge ?? null,
    ...(rawLocale != null && rawLocale !== "" ? { locale: String(rawLocale).trim() } : {}),
    ...(rawSourceLang != null && rawSourceLang !== "" ? { source_lang: String(rawSourceLang).trim() } : {}),
    ...(rawTrustLevel != null && rawTrustLevel !== "" ? { trust_level: String(rawTrustLevel).trim() } : {}),
  };
}
