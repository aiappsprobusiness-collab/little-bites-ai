import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { formatLocalDate } from "@/utils/dateUtils";
import { addDays } from "@/utils/dateRange";
import type { ProductCategory } from "./useShoppingList";
import {
  buildShoppingAggregationKey,
  chooseShoppingDisplayName,
  normalizeIngredientDisplayName,
  toShoppingDisplayUnitAndAmount,
  type NormalizedUnit,
} from "@/utils/shopping/normalizeIngredientForShopping";
import { resolveProductCategoryForShoppingIngredient } from "@/utils/shopping/inferShoppingCategoryFromIngredient";

export interface SourceRecipe {
  id: string;
  title: string;
}

export interface AggregatedIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
  /** Для отображения: если агрегировали по canonical (g/ml), показываем "150 г" и т.д. */
  displayAmount: number | null;
  displayUnit: string | null;
  category: ProductCategory | null;
  /** Рецепты, из которых попал ингредиент (для фильтра по рецептам). */
  source_recipes: SourceRecipe[];
  /** Ключ группировки (как в buildShoppingAggregationKey) — для merge без дублей при добавлении из рецепта. */
  merge_key: string;
}

type MealsSlot = { recipe_id?: string; title?: string; servings?: number };
type MealsJson = Record<string, MealsSlot | undefined>;

export function planShoppingIngredientsQueryKey(
  userId: string,
  range: "today" | "week",
  memberId: string | null | undefined
) {
  return ["plan_shopping_ingredients", userId, range, memberId ?? "family"] as const;
}

/** Агрегация ингредиентов из плана (без React Query). */
export async function loadPlanShoppingIngredients(
  userId: string,
  range: "today" | "week",
  memberId: string | null | undefined
): Promise<AggregatedIngredient[]> {
  const startDate = new Date();
  const endDate = range === "today" ? startDate : addDays(startDate, 6);
  const startStr = formatLocalDate(startDate);
  const endStr = formatLocalDate(endDate);

  let planQuery = supabase
    .from("meal_plans_v2")
    .select("id, planned_date, meals")
    .eq("user_id", userId)
    .gte("planned_date", startStr)
    .lte("planned_date", endStr);
  if (memberId === null) planQuery = planQuery.is("member_id", null);
  else if (memberId) planQuery = planQuery.eq("member_id", memberId);

  const { data: planRows, error: planErr } = await planQuery.order("planned_date", { ascending: true });
  if (planErr) throw planErr;
  const rows = (planRows ?? []) as { id: string; planned_date: string; meals?: MealsJson }[];

  const slotEntries: { recipe_id: string; servings: number }[] = [];
  for (const row of rows) {
    const meals = row.meals ?? {};
    for (const mealType of ["breakfast", "lunch", "snack", "dinner"]) {
      const slot = meals[mealType];
      if (slot?.recipe_id) {
        slotEntries.push({
          recipe_id: slot.recipe_id,
          servings: typeof slot.servings === "number" && slot.servings >= 1 ? slot.servings : 1,
        });
      }
    }
  }

  if (slotEntries.length === 0) return [];

  const recipeIds = [...new Set(slotEntries.map((e) => e.recipe_id))];
  const [recipesRes, ingredientsRes] = await Promise.all([
    supabase.from("recipes").select("id, servings_base, title").in("id", recipeIds),
    supabase
      .from("recipe_ingredients")
      .select("recipe_id, name, amount, unit, canonical_amount, canonical_unit, category, display_text")
      .in("recipe_id", recipeIds),
  ]);
  if (recipesRes.error) throw recipesRes.error;
  if (ingredientsRes.error) throw ingredientsRes.error;

  type RecipeRow = { id: string; servings_base?: number | null; title?: string | null };
  const recipeBase = new Map(
    (recipesRes.data ?? []).map((r: RecipeRow) => [r.id, Math.max(1, r.servings_base ?? 1)])
  );
  const recipeTitles = new Map(
    (recipesRes.data ?? []).map((r: RecipeRow) => [r.id, (r.title ?? "").trim()])
  );
  const ingredientsByRecipe = new Map<
    string,
    {
      name: string;
      amount: number | null;
      unit: string | null;
      canonical_amount: number | null;
      canonical_unit: string | null;
      category: string | null;
      display_text: string | null;
    }[]
  >();
  for (const ing of ingredientsRes.data ?? []) {
    const r = ing as {
      recipe_id: string;
      name: string;
      amount: number | null;
      unit: string | null;
      canonical_amount: number | null;
      canonical_unit: string | null;
      category: string | null;
      display_text: string | null;
    };
    if (!ingredientsByRecipe.has(r.recipe_id)) ingredientsByRecipe.set(r.recipe_id, []);
    ingredientsByRecipe.get(r.recipe_id)!.push(r);
  }

  type AggVal = {
    amountSum: number;
    names: string[];
    aggregationUnit: NormalizedUnit | string | null;
    category: ProductCategory | null;
    sourceRecipeIds: Set<string>;
  };
  const aggMap = new Map<string, AggVal>();

  function addSource(acc: AggVal, recipeId: string) {
    if (!acc.sourceRecipeIds) acc.sourceRecipeIds = new Set<string>();
    acc.sourceRecipeIds.add(recipeId);
  }

  for (const { recipe_id, servings } of slotEntries) {
    const base = recipeBase.get(recipe_id) ?? 1;
    const multiplier = servings / base;
    const ings = ingredientsByRecipe.get(recipe_id) ?? [];
    for (const ing of ings) {
      const category = resolveProductCategoryForShoppingIngredient(
        ing.category,
        ing.name,
        ing.display_text
      );
      const res = buildShoppingAggregationKey(
        {
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          canonical_amount: ing.canonical_amount,
          canonical_unit: ing.canonical_unit,
          category,
        },
        multiplier
      );
      if (res == null) continue;
      const cur = aggMap.get(res.key);
      if (cur) {
        cur.amountSum += res.amountToSum;
        if (!cur.names.includes(res.originalName)) cur.names.push(res.originalName);
        if (category !== "other" && cur.category === "other") cur.category = category;
        addSource(cur, recipe_id);
      } else {
        aggMap.set(res.key, {
          amountSum: res.amountToSum,
          names: [res.originalName],
          aggregationUnit: res.aggregationUnit,
          category,
          sourceRecipeIds: new Set([recipe_id]),
        });
      }
    }
  }

  function toSourceRecipes(ids: Set<string>): SourceRecipe[] {
    return [...ids].map((id) => ({ id, title: recipeTitles.get(id) ?? "" }));
  }

  const result: AggregatedIngredient[] = [];
  for (const [mergeKey, v] of aggMap.entries()) {
    if (v.amountSum <= 0) continue;
    const displayName = chooseShoppingDisplayName(v.names);
    const nameForUi = displayName ? normalizeIngredientDisplayName(displayName) : displayName;
    const { displayAmount, displayUnit } = toShoppingDisplayUnitAndAmount(v.aggregationUnit, v.amountSum);
    result.push({
      name: nameForUi,
      amount: displayAmount,
      unit: displayUnit,
      displayAmount,
      displayUnit,
      category: v.category,
      source_recipes: toSourceRecipes(v.sourceRecipeIds),
      merge_key: mergeKey,
    });
  }
  return result;
}

/**
 * Агрегирует ингредиенты из meal_plans_v2 за диапазон с учётом порций слота.
 * Ключ группировки: normalize(name) + unit (или canonical_unit для g/ml).
 */
export function usePlanShoppingIngredients(
  range: "today" | "week",
  memberId: string | null | undefined
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["plan_shopping_ingredients", user?.id, range, memberId ?? "family"],
    queryFn: async (): Promise<AggregatedIngredient[]> => {
      if (!user) return [];
      return loadPlanShoppingIngredients(user.id, range, memberId);
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
