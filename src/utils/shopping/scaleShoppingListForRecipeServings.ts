import type { ShoppingListItemRow } from "@/hooks/useShoppingList";
import type { ShoppingListItemMeta, ShoppingSourceContribution } from "@/utils/shopping/shoppingListMerge";
import { toShoppingDisplayUnitAndAmount } from "@/utils/shopping/normalizeIngredientForShopping";

export type ShoppingItemServingsUpdate = {
  id: string;
  amount: number | null;
  unit: string | null;
  meta: ShoppingListItemMeta | null;
};

function roundAgg(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Масштабирует вклады recipe_id и отображаемые количества для всех строк списка,
 * в которых этот рецепт участвует в source_contributions (или legacy recipe_id).
 */
export function computeShoppingItemUpdatesForRecipeServings(
  rows: ShoppingListItemRow[],
  recipeId: string,
  oldServings: number,
  newServings: number,
): ShoppingItemServingsUpdate[] {
  if (!recipeId || oldServings <= 0 || newServings <= 0 || oldServings === newServings) return [];
  const ratio = newServings / oldServings;
  const updates: ShoppingItemServingsUpdate[] = [];

  for (const row of rows) {
    const meta = row.meta;
    const contribs = meta?.source_contributions;

    if (contribs?.length) {
      if (!contribs.some((c) => c.recipe_id === recipeId)) continue;

      const totalBefore = contribs.reduce((s, c) => s + c.amount_sum, 0);
      const newContribs: ShoppingSourceContribution[] = contribs.map((c) =>
        c.recipe_id === recipeId ? { ...c, amount_sum: roundAgg(c.amount_sum * ratio) } : { ...c },
      );
      const totalAfter = newContribs.reduce((s, c) => s + c.amount_sum, 0);

      const nextMeta: ShoppingListItemMeta = {
        ...meta,
        source_contributions: newContribs,
      };

      const aggUnit = meta?.aggregation_unit;
      let newAmount = row.amount;
      let newUnit = row.unit;
      if (aggUnit != null && String(aggUnit).trim() !== "") {
        const d = toShoppingDisplayUnitAndAmount(aggUnit, totalAfter);
        newAmount = d.displayAmount;
        newUnit = d.displayUnit;
      }

      if (
        meta?.dual_display_amount_sum != null &&
        Number.isFinite(meta.dual_display_amount_sum) &&
        totalBefore > 0
      ) {
        nextMeta.dual_display_amount_sum = roundAgg(meta.dual_display_amount_sum * (totalAfter / totalBefore));
      }

      updates.push({ id: row.id, amount: newAmount, unit: newUnit, meta: nextMeta });
      continue;
    }

    if (row.recipe_id === recipeId && row.amount != null && Number.isFinite(row.amount)) {
      const nextMeta: ShoppingListItemMeta | null = meta ? { ...meta } : null;
      updates.push({
        id: row.id,
        amount: roundAgg(row.amount * ratio),
        unit: row.unit,
        meta: nextMeta,
      });
    }
  }

  return updates;
}
