/**
 * Канонический формат рецепта для RPC create_recipe_with_steps.
 * Любой рецепт из Plan или Chat сохраняется с едиными правилами: meal_type, tags, source в POOL_SOURCES.
 */

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
  chef_advice?: string | null;
  advice?: string | null;
  steps: CanonicalStep[] | Array<{ instruction: string; step_number?: number }>;
  ingredients: CanonicalIngredient[] | Array<Record<string, unknown>>;
  /** Для тегов: "chat" | "plan" | "week_ai". По умолчанию: chat_ai→chat, week_ai→week_ai. */
  sourceTag?: SourceTag;
  /** Явный признак супа для RPC (слот обед = только супы). При meal_type lunch по умолчанию true. */
  is_soup?: boolean | null;
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
    chef_advice,
    advice,
    steps: rawSteps,
    ingredients: rawIngredients,
    sourceTag: explicitSourceTag,
  } = input;

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
    return {
      name,
      display_text: display_text || name,
      amount: amount != null && amount !== "" ? amount : null,
      unit: (ing as { unit?: string }).unit ?? null,
      substitute: (ing as { substitute?: string }).substitute ?? null,
      canonical_amount: (ing as { canonical_amount?: number }).canonical_amount ?? null,
      canonical_unit: (ing as { canonical_unit?: string }).canonical_unit ?? null,
      order_index: (ing as { order_index?: number }).order_index ?? idx,
      category: (ing as { category?: string }).category ?? "other",
    };
  });

  if (ingredientsPayload.length < 3) {
    throw new Error("recipeCanonical: минимум 3 ингредиента требуются для create_recipe_with_steps");
  }

  const is_soup = meal_type === "lunch" ? true : (input.is_soup === true);

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
    is_soup,
  };
}
