const NUTRITION_GOALS = [
  "balanced",
  "iron_support",
  "brain_development",
  "weight_gain",
  "gentle_digestion",
  "energy_boost",
] as const;

export type NutritionGoal = (typeof NUTRITION_GOALS)[number];

const GOAL_SET = new Set<string>(NUTRITION_GOALS);

function hasAny(text: string, tokens: string[]): boolean {
  if (!text) return false;
  return tokens.some((token) => token.length > 0 && text.includes(token));
}

function normalizeGoals(input: unknown): NutritionGoal[] {
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

/** Whitelist `recipes.nutrition_goals` (jsonb) для публичных ответов API. */
export function normalizeNutritionGoalsFromDb(input: unknown): NutritionGoal[] {
  return normalizeGoals(input);
}

/**
 * Rule-based nutrition goals inference from recipe text.
 * Returns compact list (max 3) to avoid noisy tagging.
 */
export function inferNutritionGoals(recipe: unknown): NutritionGoal[] {
  const r = (recipe ?? {}) as {
    title?: string;
    description?: string;
    mealType?: string;
    ingredients?: Array<string | { name?: string; displayText?: string; display_text?: string }>;
    steps?: string[];
  };

  const ingredientText = Array.isArray(r.ingredients)
    ? r.ingredients
        .map((ing) => {
          if (typeof ing === "string") return ing;
          return [ing?.name ?? "", ing?.displayText ?? "", ing?.display_text ?? ""].join(" ");
        })
        .join(" ")
    : "";
  const stepsText = Array.isArray(r.steps) ? r.steps.join(" ") : "";
  const text = [r.title ?? "", r.description ?? "", r.mealType ?? "", ingredientText, stepsText]
    .join(" ")
    .toLowerCase();

  const goals: NutritionGoal[] = [];
  const add = (goal: NutritionGoal) => {
    if (!goals.includes(goal)) goals.push(goal);
  };

  if (hasAny(text, ["печень", "говядин", "гречк", "чечевиц"])) add("iron_support");
  if (hasAny(text, ["лосос", "семг", "форел", "яйц"])) add("brain_development");
  if (hasAny(text, ["сливк", "масл", "калорийн", "плотн", "сытн"])) add("weight_gain");
  if (hasAny(text, ["суп", "пюре", "туш", "мягк"])) add("gentle_digestion");
  if (hasAny(text, ["овсян", "банан", "быстр", "завтрак"])) add("energy_boost");

  const nonBalanced = goals.filter((g) => g !== "balanced");
  if (nonBalanced.length === 0 || nonBalanced.length >= 3) add("balanced");

  // Keep compact set: prefer specific goals, then balanced.
  const ordered: NutritionGoal[] = [...nonBalanced.slice(0, 2)];
  if (goals.includes("balanced") || ordered.length === 0) ordered.push("balanced");

  return normalizeGoals(ordered).slice(0, 3);
}

export const ALLOWED_NUTRITION_GOALS = NUTRITION_GOALS;
