/**
 * Whitelist nutrition_goals как в recipes_nutrition_goals_check (миграция nutrition_goals_stage4).
 * Алиасы из curated-сидов (в т.ч. adult) → канонические ключи для INSERT.
 */

const ALLOWED = new Set([
  "balanced",
  "iron_support",
  "brain_development",
  "weight_gain",
  "gentle_digestion",
  "energy_boost",
]);

/** @type {Record<string, string>} */
const ALIAS_TO_CANONICAL = {
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
 * @param {unknown} input
 * @returns {string[]}
 */
export function normalizeNutritionGoalsForDb(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    const canonical = ALLOWED.has(key) ? key : ALIAS_TO_CANONICAL[key];
    if (!canonical || !ALLOWED.has(canonical) || seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}
