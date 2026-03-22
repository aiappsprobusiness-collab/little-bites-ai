/**
 * Слоты плана и допустимые значения `recipes.meal_type` (без `other` и произвольных строк).
 * См. docs/database/DATABASE_SCHEMA.md (meal_type).
 */

export const RECIPE_PLAN_MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner"] as const;
export type RecipePlanMealType = (typeof RECIPE_PLAN_MEAL_TYPES)[number];

const ALLOWED = new Set<string>(RECIPE_PLAN_MEAL_TYPES);

export const RECIPE_PLAN_MEAL_LABELS_RU: Record<RecipePlanMealType, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  snack: "Полдник",
  dinner: "Ужин",
};

/** Строго breakfast | lunch | snack | dinner; иначе null. */
export function normalizeRecipePlanMealType(raw: string | null | undefined): RecipePlanMealType | null {
  const v = (raw ?? "").trim().toLowerCase();
  return ALLOWED.has(v) ? (v as RecipePlanMealType) : null;
}

export function recipePlanMealOptionsForForm(): Array<{ id: RecipePlanMealType; label: string }> {
  return RECIPE_PLAN_MEAL_TYPES.map((id) => ({ id, label: RECIPE_PLAN_MEAL_LABELS_RU[id] }));
}
