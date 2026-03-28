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

/** Алиасы из curated-сидов / LLM → ключи БД (см. recipes_nutrition_goals_check, scripts/toddler-seed/nutritionGoalsDb.mjs). */
const ALIAS_TO_CANONICAL: Record<string, NutritionGoal> = {
  balance: "balanced",
  iron: "iron_support",
  brain: "brain_development",
  weight: "weight_gain",
  digestion: "gentle_digestion",
  energy: "energy_boost",
  satiety: "weight_gain",
  protein: "balanced",
  lightness: "gentle_digestion",
  fiber: "gentle_digestion",
};

/**
 * Единый mapping подписей для UI (ключи БД + короткие алиасы).
 * Ключи в БД не меняются.
 */
export const GOAL_LABELS: Record<string, string> = {
  balance: "Баланс",
  balanced: "Баланс",
  iron: "Железо",
  iron_support: "Железо",
  brain: "Концентрация",
  brain_development: "Концентрация",
  weight_gain: "Сытность",
  digestion: "Легко усваивается",
  gentle_digestion: "Легко усваивается",
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
    if (!key) continue;
    const canonical = (GOAL_SET.has(key) ? key : ALIAS_TO_CANONICAL[key]) as NutritionGoal | undefined;
    if (!canonical || !GOAL_SET.has(canonical) || seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

export function nutritionGoalLabel(goal: string): string {
  const k = goal.trim().toLowerCase();
  return GOAL_LABELS[k] ?? goal;
}
