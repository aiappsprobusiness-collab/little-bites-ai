export const NUTRITION_GOALS = [
  "balanced",
  "iron_support",
  "brain_development",
  "weight_gain",
  "gentle_digestion",
  "energy_boost",
] as const;

export type NutritionGoal = (typeof NUTRITION_GOALS)[number];

const GOAL_SET = new Set<string>(NUTRITION_GOALS);

/**
 * Единый mapping подписей для UI (ключи БД + короткие алиасы).
 * Ключи в БД не меняются.
 */
export const GOAL_LABELS: Record<string, string> = {
  balance: "Баланс",
  balanced: "Баланс",
  iron: "Железо",
  iron_support: "Железо",
  brain: "Фокус",
  brain_development: "Фокус",
  weight_gain: "Набор веса",
  digestion: "Легкость",
  gentle_digestion: "Легкость",
  energy: "Энергия",
  energy_boost: "Энергия",
};

export function normalizeNutritionGoals(input: unknown): NutritionGoal[] {
  if (!Array.isArray(input)) return [];
  const out: NutritionGoal[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const key = raw.trim().toLowerCase();
    if (!GOAL_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key as NutritionGoal);
  }
  return out;
}

export function nutritionGoalLabel(goal: string): string {
  const k = goal.trim().toLowerCase();
  return GOAL_LABELS[k] ?? goal;
}
