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
  const ingredientsPayload = ingredients.map((ing, idx) => {
    const name = typeof ing.name === "string" ? ing.name : "";
    const amount = ing.amount;
    const displayText = ing.display_text;
    const display_text =
      displayText != null && displayText !== ""
        ? displayText
        : amount != null && amount !== ""
          ? `${name} — ${amount}`
          : name;
    return {
      name,
      display_text: display_text || name,
      amount: amount != null && amount !== "" ? amount : null,
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
    chef_advice: chef_advice ?? null,
    advice: advice ?? null,
    steps: stepsPayload,
    ingredients: ingredientsPayload,
    servings_base,
    servings_recommended,
  };
}
