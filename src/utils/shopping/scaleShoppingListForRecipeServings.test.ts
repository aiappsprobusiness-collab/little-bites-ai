import { describe, expect, it } from "vitest";
import { computeShoppingItemUpdatesForRecipeServings } from "./scaleShoppingListForRecipeServings";
import type { ShoppingListItemRow } from "@/hooks/useShoppingList";

describe("computeShoppingItemUpdatesForRecipeServings", () => {
  it("scales single-recipe contribution and dual display proportionally", () => {
    const rows: ShoppingListItemRow[] = [
      {
        id: "i1",
        shopping_list_id: "l1",
        name: "Лимон",
        amount: 1,
        unit: "шт.",
        category: "fruits",
        is_purchased: false,
        recipe_id: "r1",
        recipe_title: "Ужин",
        meta: {
          merge_key: "лимон|g",
          source_recipes: [{ id: "r1", title: "Ужин" }],
          source_contributions: [{ recipe_id: "r1", amount_sum: 90 }],
          aggregation_unit: "g",
          dual_display_amount_sum: 0.5,
          dual_display_unit: "шт.",
        },
      },
    ];
    const u = computeShoppingItemUpdatesForRecipeServings(rows, "r1", 2, 4);
    expect(u).toHaveLength(1);
    expect(u[0].meta?.source_contributions?.[0].amount_sum).toBe(180);
    expect(u[0].meta?.dual_display_amount_sum).toBe(1);
    expect(u[0].amount).toBe(180);
    expect(u[0].unit).toBe("г");
  });

  it("scales only matching recipe in merged row", () => {
    const rows: ShoppingListItemRow[] = [
      {
        id: "i1",
        shopping_list_id: "l1",
        name: "Лук",
        amount: 150,
        unit: "г",
        category: "vegetables",
        is_purchased: false,
        recipe_id: null,
        recipe_title: null,
        meta: {
          source_contributions: [
            { recipe_id: "r1", amount_sum: 50 },
            { recipe_id: "r2", amount_sum: 100 },
          ],
          aggregation_unit: "g",
        },
      },
    ];
    const u = computeShoppingItemUpdatesForRecipeServings(rows, "r1", 2, 4);
    expect(u).toHaveLength(1);
    expect(u[0].meta?.source_contributions).toEqual([
      { recipe_id: "r1", amount_sum: 100 },
      { recipe_id: "r2", amount_sum: 100 },
    ]);
    expect(u[0].amount).toBe(200);
  });

  it("returns empty when servings unchanged", () => {
    expect(computeShoppingItemUpdatesForRecipeServings([], "r1", 2, 2)).toEqual([]);
  });
});
