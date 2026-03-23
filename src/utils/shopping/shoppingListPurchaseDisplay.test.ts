import { describe, it, expect } from "vitest";
import { formatShoppingListPurchaseLine, roundPurchasePieceCount } from "./shoppingListPurchaseDisplay";

describe("roundPurchasePieceCount", () => {
  it("rounds to nearest whole piece", () => {
    expect(roundPurchasePieceCount(575, 100)).toBe(6);
    expect(roundPurchasePieceCount(470, 100)).toBe(5);
    expect(roundPurchasePieceCount(900, 100)).toBe(9);
  });
});

describe("formatShoppingListPurchaseLine", () => {
  it("dual display for onion in grams (canonical g)", () => {
    const s = formatShoppingListPurchaseLine({
      displayName: "Лук",
      amount: 575,
      unit: "г",
      mergeKey: "лук|g",
      aggregationUnit: "g",
    });
    expect(s).toBe("Лук, 6 шт. ≈ 575 г");
  });

  it("eggs: count only, no approx", () => {
    const s = formatShoppingListPurchaseLine({
      displayName: "Яйца куриные",
      amount: 8,
      unit: "шт.",
      mergeKey: "яйца|pcs",
      aggregationUnit: "pcs",
    });
    expect(s).toBe("Яйца куриные, 8 шт.");
  });

  it("garlic: cloves approx grams", () => {
    const s = formatShoppingListPurchaseLine({
      displayName: "Чеснок",
      amount: 20,
      unit: "г",
      mergeKey: "чеснок|g",
      aggregationUnit: "g",
    });
    expect(s).toBe("Чеснок, 4 зубчика ≈ 20 г");
  });

  it("mushrooms when merge_key matches", () => {
    const s = formatShoppingListPurchaseLine({
      displayName: "Шампиньоны",
      amount: 160,
      unit: "г",
      mergeKey: "шампиньоны|g",
      aggregationUnit: "g",
    });
    expect(s).toBe("Шампиньоны, 5 шт. ≈ 160 г");
  });

  it("default weight-only when no merge_key (e.g. buckwheat)", () => {
    const s = formatShoppingListPurchaseLine({
      displayName: "Гречка",
      amount: 200,
      unit: "г",
      mergeKey: null,
      aggregationUnit: null,
    });
    expect(s).toBe("Гречка, 200 г");
  });

  it("copy delimiter", () => {
    const s = formatShoppingListPurchaseLine(
      {
        displayName: "Лук",
        amount: 100,
        unit: "г",
        mergeKey: "лук|g",
        aggregationUnit: "g",
      },
      { delimiter: " — " }
    );
    expect(s).toBe("Лук — 1 шт. ≈ 100 г");
  });
});
