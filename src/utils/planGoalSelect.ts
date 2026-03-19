import { GOAL_LABELS, NUTRITION_GOALS, type NutritionGoal } from "@/utils/nutritionGoals";

/** Один выбор цели для генерации плана (значения = ключи БД). */
export const PLAN_GOAL_SELECT_ORDER: NutritionGoal[] = [...NUTRITION_GOALS];

export function planGoalChipLabel(goal: string): string {
  return GOAL_LABELS[goal] ?? goal;
}
