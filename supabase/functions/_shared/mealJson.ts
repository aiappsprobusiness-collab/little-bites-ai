/**
 * Helpers for reading/writing meal_plans_v2.meals jsonb.
 * Preserves existing keys (servings, ingredient_overrides, family) when merging.
 */

export type FamilyInfantSlot = {
  member_id: string;
  mode: "adapt" | "alt";
  adaptation?: string;
  alt_recipe_id?: string;
};

export type MealSlotValue = {
  recipe_id?: string;
  title?: string;
  plan_source?: "pool" | "ai";
  servings?: number;
  ingredient_overrides?: unknown[];
  family?: { infant?: FamilyInfantSlot };
};

/**
 * Get family.infant from a meal slot (from DB or in-memory).
 */
export function getFamilyInfant(slot: MealSlotValue | null | undefined): FamilyInfantSlot | undefined {
  if (slot == null || typeof slot !== "object") return undefined;
  const family = (slot as MealSlotValue).family;
  return family?.infant;
}

/**
 * Set family.infant on a slot without mutating. Returns new slot object.
 */
export function setFamilyInfant(
  slot: MealSlotValue | null | undefined,
  infant: FamilyInfantSlot | null
): MealSlotValue {
  const base = slot != null && typeof slot === "object" ? { ...slot } : ({} as MealSlotValue);
  if (infant == null) {
    const { family, ...rest } = base;
    const nextFamily = family && typeof family === "object" ? { ...family, infant: undefined } : undefined;
    if (nextFamily && Object.keys(nextFamily).length === 0) return rest as MealSlotValue;
    if (nextFamily) return { ...rest, family: nextFamily } as MealSlotValue;
    return rest as MealSlotValue;
  }
  return { ...base, family: { ...(base.family && typeof base.family === "object" ? base.family : {}), infant } };
}

/**
 * Normalize slot for write: keep recipe_id, title, plan_source, and optionally family (and other known keys).
 * Used when upserting so we don't strip family from slots.
 */
export function normalizeSlotForWrite(slot: MealSlotValue | null | undefined): MealSlotValue | null {
  if (slot == null || typeof slot !== "object") return null;
  const rid = (slot as MealSlotValue & { recipeId?: string }).recipe_id ?? (slot as MealSlotValue & { recipeId?: string }).recipeId;
  if (!rid || typeof rid !== "string") return null;
  const out: MealSlotValue = {
    recipe_id: rid,
    title: (slot.title ?? "Рецепт") as string,
    plan_source: slot.plan_source,
  };
  if (slot.servings != null) out.servings = slot.servings;
  if (Array.isArray(slot.ingredient_overrides)) out.ingredient_overrides = slot.ingredient_overrides;
  return out;
}
