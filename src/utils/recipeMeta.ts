/**
 * Нормализация метаданных AI-рецепта перед сохранением в БД.
 * Контракт: любой AI-рецепт (chat_ai / week_ai) должен иметь meal_type (NOT NULL) и tags (минимум по источнику и приёму пищи).
 */

const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

const TAG_TO_MEAL: Record<string, MealType> = {
  chat_breakfast: "breakfast",
  chat_lunch: "lunch",
  chat_dinner: "dinner",
  chat_snack: "snack",
  week_breakfast: "breakfast",
  week_lunch: "lunch",
  week_dinner: "dinner",
  week_snack: "snack",
};

function isMealType(s: string): s is MealType {
  return MEAL_TYPES.includes(s as MealType);
}

export interface NormalizeRecipeMetaInput {
  source: "chat_ai" | "week_ai";
  mealType?: string | null;
  tags?: string[] | null;
}

export interface NormalizeRecipeMetaResult {
  meal_type: MealType;
  tags: string[];
}

/**
 * Нормализует meal_type и tags для AI-рецепта.
 * - meal_type: из mealType, иначе из tags (chat_breakfast => breakfast), иначе fallback 'snack'.
 * - tags: уникальный массив с базовым тегом по source и тегом по приёму (chat_breakfast / week_breakfast и т.д.).
 */
export function normalizeRecipeMeta(input: NormalizeRecipeMetaInput): NormalizeRecipeMetaResult {
  const { source, mealType, tags: rawTags } = input;
  const tagsList = Array.isArray(rawTags) ? rawTags : [];

  let meal_type: MealType;
  if (mealType && isMealType(mealType)) {
    meal_type = mealType;
  } else {
    const fromTag = tagsList.find((t) => t in TAG_TO_MEAL) as keyof typeof TAG_TO_MEAL | undefined;
    meal_type = fromTag ? TAG_TO_MEAL[fromTag] : "snack";
  }

  const sourceTag = source === "chat_ai" ? "chat" : "week_ai";
  const mealTag = source === "chat_ai" ? `chat_${meal_type}` : `week_${meal_type}`;
  const combined = [sourceTag, mealTag, ...tagsList].filter(Boolean);
  const tags = [...new Set(combined)];

  return { meal_type, tags };
}
