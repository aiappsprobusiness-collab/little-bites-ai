import { NUTRITION_GOALS, type NutritionGoal } from "@/utils/nutritionGoals";

const GOAL_SET = new Set<string>(NUTRITION_GOALS);

/**
 * Короткое пояснение под бейджем «Под вашу цель» на карточке плана.
 * Для «Баланс» — пусто (не показываем блок).
 */
export function getGoalShortDescription(goal: string): string {
  const k = goal.trim().toLowerCase();
  if (!GOAL_SET.has(k)) return "";
  switch (k as NutritionGoal) {
    case "balanced":
      return "";
    case "iron_support":
      return "Богато железом";
    case "brain_development":
      return "Поддерживает развитие";
    case "weight_gain":
      return "Повышенная калорийность";
    case "gentle_digestion":
      return "Легко усваивается";
    case "energy_boost":
      return "Дополнительная энергия";
    default:
      return "";
  }
}
