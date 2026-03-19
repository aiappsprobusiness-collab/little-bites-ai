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

const GOAL_LABELS: Record<NutritionGoal, string> = {
  balanced: "Сбалансировано",
  iron_support: "Железо",
  brain_development: "Развитие мозга",
  weight_gain: "Набор веса",
  gentle_digestion: "Лёгкое пищеварение",
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
  return GOAL_LABELS[goal as NutritionGoal] ?? goal;
}
