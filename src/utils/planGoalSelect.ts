import { GOAL_LABELS, NUTRITION_GOALS, type NutritionGoal } from "@/utils/nutritionGoals";

/** Один выбор цели для генерации плана (значения = ключи БД). */
export const PLAN_GOAL_SELECT_ORDER: NutritionGoal[] = [...NUTRITION_GOALS];

export function planGoalChipLabel(goal: string): string {
  return GOAL_LABELS[goal] ?? goal;
}

/**
 * Ключ `selected_goal` для `generate-plan` (только не balanced).
 * Free: всегда undefined — без премиум-целей на бэке.
 * Premium/Trial: передаём выбранную цель, если не «Баланс».
 */
export function selectGoalForEdge(
  hasSubscriptionAccess: boolean,
  selection: string | null | undefined,
): string | undefined {
  if (!hasSubscriptionAccess) return undefined;
  if (selection == null || selection === "balanced") return undefined;
  return selection;
}
