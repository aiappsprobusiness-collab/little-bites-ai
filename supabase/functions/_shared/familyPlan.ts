/**
 * Family 1.0: infant layer for meal_plans_v2.meals (adapt vs alt).
 * No AI; no new recipes in pool. Infant = age_months < 12.
 */

import type { FamilyInfantSlot } from "./mealJson.ts";

export type MemberForFamily = { id: string; name?: string; age_months?: number | null; allergies?: string[] | null };
export type RecipeForFamily = {
  id: string;
  title: string;
  description?: string | null;
  recipe_ingredients?: Array<{ name?: string; display_text?: string }> | null;
  min_age_months?: number | null;
  max_age_months?: number | null;
};

const INFANT_AGE_MAX_MONTHS = 12;

/** Keywords that force alt (separate infant recipe) instead of adapt. */
const ALT_KEYWORDS = [
  "острый", "перец", "жарен", "копчен", "гриб", "грибы", "орех", "орехи", "мёд", "мед",
  "перец", "остро", "копчено", "жареный", "жареная",
];

const ADAPT_DEFAULT =
  "Отложите порцию до соли и специй и измельчите блендером до нужной консистенции.";

/**
 * Returns the youngest member with age_months < 12, or null.
 * Family 1.0: 0..1 infant; if multiple, take youngest (TODO: array later).
 */
export function getInfantMember(members: MemberForFamily[]): MemberForFamily | null {
  const infants = members.filter(
    (m) => m.age_months != null && Number.isFinite(m.age_months) && m.age_months < INFANT_AGE_MAX_MONTHS
  );
  if (infants.length === 0) return null;
  const sorted = [...infants].sort((a, b) => (a.age_months ?? 0) - (b.age_months ?? 0));
  return sorted[0] ?? null;
}

/**
 * True if recipe title/description/ingredients don't contain alt-forcing keywords.
 */
export function isProbablyInfantAdaptable(recipe: RecipeForFamily): boolean {
  const text = [
    recipe.title ?? "",
    recipe.description ?? "",
    ...(recipe.recipe_ingredients ?? []).map((ri) => [ri.name ?? "", ri.display_text ?? ""].join(" ")),
  ]
    .join(" ")
    .toLowerCase();
  return !ALT_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Short adaptation text for infant (no AI).
 */
export function buildInfantAdaptation(_recipe: RecipeForFamily): string {
  return ADAPT_DEFAULT;
}

/**
 * Decide adapt vs alt for a meal slot.
 * - breakfast/snack: prefer adapt if adaptable, else alt.
 * - lunch/dinner: if recipe has alt keywords -> alt; else adapt.
 */
export function decideInfantMode(
  recipe: RecipeForFamily,
  mealKey: string
): "adapt" | "alt" {
  const adaptable = isProbablyInfantAdaptable(recipe);
  const preferAlt = mealKey === "breakfast" || mealKey === "snack";
  if (preferAlt && !adaptable) return "alt";
  if (!adaptable) return "alt";
  return "adapt";
}

/**
 * Build family.infant slot for a meal (adapt mode).
 */
export function buildInfantAdaptSlot(
  infantMemberId: string,
  recipe: RecipeForFamily
): FamilyInfantSlot {
  return {
    member_id: infantMemberId,
    mode: "adapt",
    adaptation: buildInfantAdaptation(recipe),
  };
}

/**
 * Build family.infant slot for a meal (alt mode) with chosen alt recipe.
 */
export function buildInfantAltSlot(
  infantMemberId: string,
  altRecipeId: string
): FamilyInfantSlot {
  return {
    member_id: infantMemberId,
    mode: "alt",
    alt_recipe_id: altRecipeId,
  };
}

/**
 * Pick an infant-compatible recipe from pool for the given meal type.
 * Filter: recipeFitsAgeRange(age_months < 12), !recipeBlockedByInfantKeywords, meal type match.
 * Caller provides filter logic; this is a simple pick-first helper.
 */
export function pickAltRecipeForInfant(
  pool: RecipeForFamily[],
  mealKey: string,
  infantAgeMonths: number,
  excludeRecipeIds: string[],
  mealTypeMatches: (r: RecipeForFamily, slot: string) => boolean
): RecipeForFamily | null {
  const excludeSet = new Set(excludeRecipeIds);
  const slot = mealKey.toLowerCase();
  for (const r of pool) {
    if (excludeSet.has(r.id)) continue;
    if (!mealTypeMatches(r, slot)) continue;
    const min = r.min_age_months;
    const max = r.max_age_months;
    if (min != null && infantAgeMonths < min) continue;
    if (max != null && infantAgeMonths > max) continue;
    if (!isProbablyInfantAdaptable(r)) continue;
    return r;
  }
  return null;
}
