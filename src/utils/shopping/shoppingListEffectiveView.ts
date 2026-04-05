import type { ShoppingListItemRow } from "@/hooks/useShoppingList";
import { getSourceRecipesFromItem, type SourceRecipe } from "@/hooks/useShoppingList";
import { toShoppingDisplayUnitAndAmount } from "@/utils/shopping/normalizeIngredientForShopping";

export type EffectiveShoppingItemView = {
  amount: number | null;
  unit: string | null;
  sources: SourceRecipe[];
  recipeCount: number;
  /** Масштабированная левая часть dual (фильтр по рецептам). */
  scaledDualDisplayAmount: number | null;
  dualDisplayUnit: string | null;
};

/**
 * Отображаемые количество, единицы и список рецептов для строки списка покупок.
 * При активном фильтре по рецептам пересчитывает amount из source_contributions + aggregation_unit;
 * иначе — данные строки как есть.
 */
export function computeEffectiveShoppingItemView(
  row: ShoppingListItemRow,
  recipeFilterSelectedIds: Set<string> | null,
): EffectiveShoppingItemView {
  const allSources = getSourceRecipesFromItem(row);
  const filterActive = recipeFilterSelectedIds != null && recipeFilterSelectedIds.size > 0;
  const meta = row.meta;
  const dualSum = meta?.dual_display_amount_sum;
  const dualUnitRaw = meta?.dual_display_unit?.trim() ?? null;

  const scaleDualLeft = (partialCanon: number | null, totalCanon: number): number | null => {
    if (dualSum == null || !Number.isFinite(dualSum) || !dualUnitRaw) return null;
    if (totalCanon <= 0 || partialCanon == null || partialCanon <= 0) return null;
    return dualSum * (partialCanon / totalCanon);
  };

  if (!filterActive || allSources.length === 0) {
    return {
      amount: row.amount,
      unit: row.unit,
      sources: allSources,
      recipeCount: allSources.length,
      scaledDualDisplayAmount: dualSum != null && Number.isFinite(dualSum) ? dualSum : null,
      dualDisplayUnit: dualUnitRaw,
    };
  }

  const effectiveSources = allSources.filter((s) => recipeFilterSelectedIds.has(s.id));
  const contribs = meta?.source_contributions;
  const aggUnit = meta?.aggregation_unit;

  if (effectiveSources.length === 0) {
    return {
      amount: row.amount,
      unit: row.unit,
      sources: [],
      recipeCount: 0,
      scaledDualDisplayAmount: null,
      dualDisplayUnit: dualUnitRaw,
    };
  }

  if (contribs?.length && aggUnit != null && String(aggUnit).trim() !== "") {
    let total = 0;
    for (const c of contribs) total += c.amount_sum;
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
        scaledDualDisplayAmount: scaleDualLeft(partial, total),
        dualDisplayUnit: dualUnitRaw,
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
    scaledDualDisplayAmount:
      dualSum != null && Number.isFinite(dualSum) && totalN > 0 ? (dualSum * effN) / totalN : dualSum,
    dualDisplayUnit: dualUnitRaw,
  };
}
