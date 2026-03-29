/**
 * Накопление счётчиков ключевых продуктов по recipe_id (для weekly / replace_slot).
 * Данные для будущего two-phase planner: профиль-валидный universe отдельно, assembler — отдельно.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  addKeyIngredientKeysToCounts,
  deriveKeyIngredientSignals,
  type IngredientRowForKey,
} from "../../../../shared/keyIngredientSignals.ts";

export type RecipeRowForIngredientCount = {
  id?: string;
  title?: string | null;
  description?: string | null;
  recipe_ingredients?: IngredientRowForKey[] | null;
};

const CHUNK = 80;

const MEAL_SLOT_KEYS = ["breakfast", "lunch", "snack", "dinner"] as const;

export function mergeKeyIngredientCountsFromRecipeRows(
  rows: RecipeRowForIngredientCount[],
  into: Record<string, number>,
  options?: { mealType?: string | null; byMealType?: Record<string, Record<string, number>> },
): void {
  for (const row of rows) {
    const sig = deriveKeyIngredientSignals(row);
    addKeyIngredientKeysToCounts(sig.keys, into, options?.mealType ?? undefined, options?.byMealType);
  }
}

export async function fetchAndMergeKeyIngredientCounts(
  supabase: SupabaseClient,
  recipeIds: string[],
  into: Record<string, number>,
): Promise<void> {
  const ids = [...new Set(recipeIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) return;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("recipes")
      .select("id, title, description, recipe_ingredients(name, display_text)")
      .in("id", slice);
    if (error) continue;
    for (const row of (data ?? []) as RecipeRowForIngredientCount[]) {
      const sig = deriveKeyIngredientSignals(row);
      addKeyIngredientKeysToCounts(sig.keys, into);
    }
  }
}

export type KeyIngredientPlanSlotEntry = { recipe_id: string; meal_key: string };

/** Слоты с recipe_id из строк плана (каждый слот отдельно — корректные глобальные счётчики при повторе одного recipe_id). */
export function collectKeyIngredientSlotEntriesFromPlanRows(
  rows: Array<{ meals?: Record<string, { recipe_id?: string }> }>,
): KeyIngredientPlanSlotEntry[] {
  const out: KeyIngredientPlanSlotEntry[] = [];
  for (const row of rows) {
    const meals = row.meals ?? {};
    for (const mk of MEAL_SLOT_KEYS) {
      const rid = meals[mk]?.recipe_id;
      if (typeof rid === "string" && rid.length > 0) out.push({ recipe_id: rid, meal_key: mk });
    }
  }
  return out;
}

export async function fetchKeyIngredientSlotEntriesForDateKeys(
  supabase: SupabaseClient,
  userId: string,
  memberId: string | null,
  dateKeys: string[],
): Promise<KeyIngredientPlanSlotEntry[]> {
  if (dateKeys.length === 0) return [];
  let q = supabase
    .from("meal_plans_v2")
    .select("planned_date, meals")
    .eq("user_id", userId)
    .in("planned_date", dateKeys);
  if (memberId == null) q = q.is("member_id", null);
  else q = q.eq("member_id", memberId);
  const { data } = await q;
  return collectKeyIngredientSlotEntriesFromPlanRows(data ?? []);
}

/**
 * Batch: для каждого слота плана — инкремент ключей в global и byMealType[meal_key].
 */
export async function fetchAndMergeKeyIngredientCountsForSlotEntries(
  supabase: SupabaseClient,
  entries: KeyIngredientPlanSlotEntry[],
  intoGlobal: Record<string, number>,
  intoByMeal: Record<string, Record<string, number>>,
): Promise<void> {
  if (entries.length === 0) return;
  const idSet = new Set(entries.map((e) => e.recipe_id).filter((id) => id.length > 0));
  const ids = [...idSet];
  const idToRows = new Map<string, RecipeRowForIngredientCount>();

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("recipes")
      .select("id, title, description, recipe_ingredients(name, display_text)")
      .in("id", slice);
    if (error) continue;
    for (const row of (data ?? []) as RecipeRowForIngredientCount[]) {
      if (row.id) idToRows.set(row.id, row);
    }
  }

  for (const { recipe_id, meal_key } of entries) {
    const row = idToRows.get(recipe_id);
    if (!row) continue;
    const sig = deriveKeyIngredientSignals(row);
    addKeyIngredientKeysToCounts(sig.keys, intoGlobal, meal_key, intoByMeal);
  }
}

/** recipe_id из плана по датам, исключая один слот (для replace: не учитывать заменяемое блюдо). */
export async function collectRecipeIdsFromMealPlansExcludingSlot(
  supabase: SupabaseClient,
  userId: string,
  memberId: string | null,
  plannedDates: string[],
  excludeDayKey: string,
  excludeMealKey: string,
): Promise<string[]> {
  if (plannedDates.length === 0) return [];
  let q = supabase
    .from("meal_plans_v2")
    .select("planned_date, meals")
    .eq("user_id", userId)
    .in("planned_date", plannedDates);
  if (memberId == null) q = q.is("member_id", null);
  else q = q.eq("member_id", memberId);
  const { data } = await q;
  const ids: string[] = [];
  for (const row of data ?? []) {
    const dk = (row as { planned_date?: string }).planned_date;
    const meals = (row as { meals?: Record<string, { recipe_id?: string }> }).meals ?? {};
    for (const mk of MEAL_SLOT_KEYS) {
      if (dk === excludeDayKey && mk === excludeMealKey) continue;
      const rid = meals[mk]?.recipe_id;
      if (typeof rid === "string" && rid.length > 0) ids.push(rid);
    }
  }
  return ids;
}

/** Как collectRecipeIdsFromMealPlansExcludingSlot, но с meal_key для byMealType. */
export async function collectRecipeSlotsFromMealPlansExcludingSlot(
  supabase: SupabaseClient,
  userId: string,
  memberId: string | null,
  plannedDates: string[],
  excludeDayKey: string,
  excludeMealKey: string,
): Promise<KeyIngredientPlanSlotEntry[]> {
  if (plannedDates.length === 0) return [];
  let q = supabase
    .from("meal_plans_v2")
    .select("planned_date, meals")
    .eq("user_id", userId)
    .in("planned_date", plannedDates);
  if (memberId == null) q = q.is("member_id", null);
  else q = q.eq("member_id", memberId);
  const { data } = await q;
  const out: KeyIngredientPlanSlotEntry[] = [];
  for (const row of data ?? []) {
    const dk = (row as { planned_date?: string }).planned_date;
    const meals = (row as { meals?: Record<string, { recipe_id?: string }> }).meals ?? {};
    for (const mk of MEAL_SLOT_KEYS) {
      if (dk === excludeDayKey && mk === excludeMealKey) continue;
      const rid = meals[mk]?.recipe_id;
      if (typeof rid === "string" && rid.length > 0) out.push({ recipe_id: rid, meal_key: mk });
    }
  }
  return out;
}
