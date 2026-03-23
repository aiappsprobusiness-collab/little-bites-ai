import type { ShoppingListItemRow } from "@/hooks/useShoppingList";
import { getSourceRecipesFromItem, type SourceRecipe } from "@/hooks/useShoppingList";
import { toShoppingDisplayUnitAndAmount } from "@/utils/shopping/normalizeIngredientForShopping";

export type EffectiveShoppingItemView = {
  amount: number | null;
  unit: string | null;
  sources: SourceRecipe[];
  recipeCount: number;
};

/**
 * Отображаемые количество, единицы и список рецептов для строки списка покупок.
 * При активном фильтре по рецептам пересчитывает amount из source_contributions + aggregation_unit;
 * иначе — данные строки как есть.
 */
export function computeEffectiveShoppingItemView(
  row: ShoppingListItemRow,
  recipeFilterSelectedIds: Set<string> | null
): EffectiveShoppingItemView {
  const allSources = getSourceRecipesFromItem(row);
  const filterActive = recipeFilterSelectedIds != null && recipeFilterSelectedIds.size > 0;

  if (!filterActive || allSources.length === 0) {
    return {
      amount: row.amount,
      unit: row.unit,
      sources: allSources,
      recipeCount: allSources.length,
    };
  }

  const effectiveSources = allSources.filter((s) => recipeFilterSelectedIds.has(s.id));
  const meta = row.meta;
  const contribs = meta?.source_contributions;
  const aggUnit = meta?.aggregation_unit;

  if (effectiveSources.length === 0) {
    return {
      amount: row.amount,
      unit: row.unit,
      sources: [],
      recipeCount: 0,
    };
  }

  if (contribs?.length && aggUnit != null && String(aggUnit).trim() !== "") {
    let partial = 0;
    for (const c of contribs) {
      if (recipeFilterSelectedIds.has(c.recipe_id)) partial += c.amount_sum;
    }
    if (partial > 0) {
      const { displayAmount, displayUnit } = toShoppingDisplayUnitAndAmount(aggUnit, partial);
      return {
        amount: displayAmount,
        unit: displayUnit,
        sources: effectiveSources,
        recipeCount: effectiveSources.length,
      };
    }
  }

  const totalN = allSources.length;
  const effN = effectiveSources.length;
  const a =
    row.amount != null && Number.isFinite(row.amount) && totalN > 0
      ? (row.amount * effN) / totalN
      : row.amount;
  return {
    amount: a,
    unit: row.unit,
    sources: effectiveSources,
    recipeCount: effectiveSources.length,
  };
}
