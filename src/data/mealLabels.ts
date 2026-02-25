/** Единый источник подписей типа приёма пищи для карточек рецептов и плана */

export const MEAL_LABELS: Record<string, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  snack: "Перекус",
  dinner: "Ужин",
};

export function getMealLabel(mealType: string | null | undefined): string | null {
  if (!mealType) return null;
  return MEAL_LABELS[mealType] ?? null;
}
