import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { formatLocalDate } from "@/utils/dateUtils";
import { addDays } from "@/utils/dateRange";
import type { ProductCategory } from "./useShoppingList";

export interface AggregatedIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
  /** Для отображения: если агрегировали по canonical (g/ml), показываем "150 г" и т.д. */
  displayAmount: number | null;
  displayUnit: string | null;
  category: ProductCategory | null;
}

type MealsSlot = { recipe_id?: string; title?: string; servings?: number };
type MealsJson = Record<string, MealsSlot | undefined>;

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
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
      const startDate = new Date();
      const endDate = range === "today" ? startDate : addDays(startDate, 6);
      const startStr = formatLocalDate(startDate);
      const endStr = formatLocalDate(endDate);

      let planQuery = supabase
        .from("meal_plans_v2")
        .select("id, planned_date, meals")
        .eq("user_id", user.id)
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
        supabase.from("recipes").select("id, servings_base").in("id", recipeIds),
        supabase
          .from("recipe_ingredients")
          .select("recipe_id, name, amount, unit, canonical_amount, canonical_unit, category")
          .in("recipe_id", recipeIds),
      ]);
      if (recipesRes.error) throw recipesRes.error;
      if (ingredientsRes.error) throw ingredientsRes.error;

      const recipeBase = new Map(
        (recipesRes.data ?? []).map((r: { id: string; servings_base?: number | null }) => [
          r.id,
          Math.max(1, r.servings_base ?? 1),
        ])
      );
      const ingredientsByRecipe = new Map<string, { name: string; amount: number | null; unit: string | null; canonical_amount: number | null; canonical_unit: string | null; category: string | null }[]>();
      for (const ing of ingredientsRes.data ?? []) {
        const r = ing as { recipe_id: string; name: string; amount: number | null; unit: string | null; canonical_amount: number | null; canonical_unit: string | null; category: string | null };
        if (!ingredientsByRecipe.has(r.recipe_id)) ingredientsByRecipe.set(r.recipe_id, []);
        ingredientsByRecipe.get(r.recipe_id)!.push(r);
      }

      const aggByKey = new Map<string, { name: string; amount: number; unit: string | null; canonicalAmount: number; canonicalUnit: string | null; category: ProductCategory | null }>();
      const rawByKey = new Map<string, { name: string; amount: number; unit: string | null; category: ProductCategory | null }>();

      for (const { recipe_id, servings } of slotEntries) {
        const base = recipeBase.get(recipe_id) ?? 1;
        const multiplier = servings / base;
        const ings = ingredientsByRecipe.get(recipe_id) ?? [];
        for (const ing of ings) {
          const amount = ing.amount != null && Number.isFinite(ing.amount) ? ing.amount * multiplier : null;
          const canAmount = ing.canonical_amount != null && Number.isFinite(ing.canonical_amount) ? ing.canonical_amount * multiplier : null;
          const canUnit = ing.canonical_unit === "g" || ing.canonical_unit === "ml" ? ing.canonical_unit : null;
          const category = (ing.category as ProductCategory) ?? "other";

          if (canAmount != null && canUnit) {
            const key = `${normalizeName(ing.name)}|${canUnit}`;
            const cur = aggByKey.get(key);
            if (cur) {
              cur.canonicalAmount += canAmount;
            } else {
              aggByKey.set(key, {
                name: ing.name.trim(),
                amount: amount ?? 0,
                unit: ing.unit,
                canonicalAmount: canAmount,
                canonicalUnit: canUnit,
                category,
              });
            }
          } else {
            const u = ing.unit ?? "";
            const key = `${normalizeName(ing.name)}|${u}`;
            const cur = rawByKey.get(key);
            if (cur) {
              cur.amount += amount ?? 0;
            } else {
              rawByKey.set(key, {
                name: ing.name.trim(),
                amount: amount ?? 0,
                unit: ing.unit ?? null,
                category,
              });
            }
          }
        }
      }

      const result: AggregatedIngredient[] = [];
      for (const v of aggByKey.values()) {
        result.push({
          name: v.name,
          amount: v.amount || null,
          unit: v.unit,
          displayAmount: Math.round(v.canonicalAmount * 10) / 10,
          displayUnit: v.canonicalUnit,
          category: v.category,
        });
      }
      for (const v of rawByKey.values()) {
        if (v.amount > 0) {
          result.push({
            name: v.name,
            amount: v.amount,
            unit: v.unit,
            displayAmount: v.amount,
            displayUnit: v.unit,
            category: v.category,
          });
        }
      }
      return result;
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
