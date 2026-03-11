import { describe, it, expect } from "vitest";
import {
  normalizeIngredientNameForShopping,
  normalizeIngredientUnitForShopping,
  buildShoppingAggregationKey,
  chooseShoppingDisplayName,
  STRIP_SUFFIXES,
  SPOON_TO_ML,
} from "./normalizeIngredientForShopping";

describe("normalizeIngredientNameForShopping", () => {
  it("lowercases and trims", () => {
    expect(normalizeIngredientNameForShopping("  Банан  ")).toBe("банан");
  });

  it("strips descriptive suffixes", () => {
    expect(normalizeIngredientNameForShopping("Банан спелый")).toBe("банан");
    expect(normalizeIngredientNameForShopping("Лук репчатый")).toBe("лук");
    expect(normalizeIngredientNameForShopping("Укроп свежий")).toBe("укроп");
  });

  it("strips fat percentage", () => {
    expect(normalizeIngredientNameForShopping("Сливки 10%")).toBe("сливки");
    expect(normalizeIngredientNameForShopping("Сливки 20%")).toBe("сливки");
    expect(normalizeIngredientNameForShopping("Молоко 3.2%")).toBe("молоко");
  });

  it("strips parenthetical text", () => {
    expect(normalizeIngredientNameForShopping("Тыква (очищенная, нарезанная кубиками)")).toBe("тыква");
  });

  it("collapses spaces", () => {
    expect(normalizeIngredientNameForShopping("Укроп   свежий")).toBe("укроп");
  });
});

describe("normalizeIngredientUnitForShopping", () => {
  it("prefers canonical_unit g/ml", () => {
    expect(normalizeIngredientUnitForShopping("грамм", "g")).toBe("g");
    expect(normalizeIngredientUnitForShopping("мл", "ml")).toBe("ml");
  });

  it("normalizes г/гр/g to g", () => {
    expect(normalizeIngredientUnitForShopping("г")).toBe("g");
    expect(normalizeIngredientUnitForShopping("гр")).toBe("g");
    expect(normalizeIngredientUnitForShopping("g")).toBe("g");
  });

  it("normalizes мл/ml to ml", () => {
    expect(normalizeIngredientUnitForShopping("мл")).toBe("ml");
    expect(normalizeIngredientUnitForShopping("ml")).toBe("ml");
  });

  it("normalizes spoons", () => {
    expect(normalizeIngredientUnitForShopping("ст.л.")).toBe("tbsp");
    expect(normalizeIngredientUnitForShopping("ч.л.")).toBe("tsp");
  });

  it("normalizes шт to pcs", () => {
    expect(normalizeIngredientUnitForShopping("шт")).toBe("pcs");
    expect(normalizeIngredientUnitForShopping("штука")).toBe("pcs");
  });
});

describe("buildShoppingAggregationKey", () => {
  it("Вода 350 мл + Вода 300 ml → same key, amounts 350 and 300", () => {
    const r1 = buildShoppingAggregationKey(
      { name: "Вода", amount: 350, unit: "мл", canonical_amount: null, canonical_unit: null },
      1
    );
    const r2 = buildShoppingAggregationKey(
      { name: "Вода", amount: 300, unit: "ml", canonical_amount: null, canonical_unit: null },
      1
    );
    expect(r1?.key).toBe("вода|ml");
    expect(r2?.key).toBe("вода|ml");
    expect(r1?.amountToSum).toBe(350);
    expect(r2?.amountToSum).toBe(300);
  });

  it("Банан + Банан спелый (same unit) → same key", () => {
    const r1 = buildShoppingAggregationKey(
      { name: "Банан", amount: 1, unit: "шт.", canonical_amount: null, canonical_unit: null },
      1
    );
    const r2 = buildShoppingAggregationKey(
      { name: "Банан спелый", amount: 0.5, unit: "шт.", canonical_amount: null, canonical_unit: null },
      1
    );
    expect(r1?.key).toBe("банан|pcs");
    expect(r2?.key).toBe("банан|pcs");
  });

  it("Сливки 10% + Сливки 20% → same key", () => {
    const r1 = buildShoppingAggregationKey(
      { name: "Сливки 10%", amount: 50, unit: "мл", canonical_amount: 50, canonical_unit: "ml" },
      1
    );
    const r2 = buildShoppingAggregationKey(
      { name: "Сливки 20%", amount: 100, unit: "мл", canonical_amount: 100, canonical_unit: "ml" },
      1
    );
    expect(r1?.key).toBe("сливки|ml");
    expect(r2?.key).toBe("сливки|ml");
  });

  it("Лук репчатый 50 г + Лук репчатый 20 г → same key 70 г", () => {
    const r1 = buildShoppingAggregationKey(
      { name: "Лук репчатый", amount: 50, unit: "г", canonical_amount: 50, canonical_unit: "g" },
      1
    );
    const r2 = buildShoppingAggregationKey(
      { name: "Лук репчатый", amount: 20, unit: "г", canonical_amount: 20, canonical_unit: "g" },
      1
    );
    expect(r1?.key).toBe("лук|g");
    expect(r2?.key).toBe("лук|g");
    expect(r1?.amountToSum).toBe(50);
    expect(r2?.amountToSum).toBe(20);
  });

  it("1 ст.л. + 2 ч.л. одного продукта → both in ml, same key", () => {
    const r1 = buildShoppingAggregationKey(
      { name: "Укроп", amount: 1, unit: "ст.л.", canonical_amount: null, canonical_unit: null },
      1
    );
    const r2 = buildShoppingAggregationKey(
      { name: "Укроп", amount: 2, unit: "ч.л.", canonical_amount: null, canonical_unit: null },
      1
    );
    expect(r1?.key).toBe("укроп|ml");
    expect(r2?.key).toBe("укроп|ml");
    expect(r1?.amountToSum).toBe(15);
    expect(r2?.amountToSum).toBe(10);
  });

  it("Картофель 200 г и Картофель 1 шт. → different keys", () => {
    const r1 = buildShoppingAggregationKey(
      { name: "Картофель", amount: 200, unit: "г", canonical_amount: 200, canonical_unit: "g" },
      1
    );
    const r2 = buildShoppingAggregationKey(
      { name: "Картофель", amount: 1, unit: "шт.", canonical_amount: null, canonical_unit: null },
      1
    );
    expect(r1?.key).toBe("картофель|g");
    expect(r2?.key).toBe("картофель|pcs");
  });

  it("canonical_unit ml у одного, unit=мл у второго → same key", () => {
    const r1 = buildShoppingAggregationKey(
      { name: "Вода", amount: 100, unit: "мл", canonical_amount: 100, canonical_unit: "ml" },
      1
    );
    const r2 = buildShoppingAggregationKey(
      { name: "Вода", amount: 200, unit: "мл", canonical_amount: null, canonical_unit: null },
      1
    );
    expect(r1?.key).toBe("вода|ml");
    expect(r2?.key).toBe("вода|ml");
  });
});

describe("chooseShoppingDisplayName", () => {
  it("returns shortest clean name", () => {
    expect(chooseShoppingDisplayName(["Лук репчатый", "Лук"])).toBe("Лук");
    expect(chooseShoppingDisplayName(["Банан спелый", "Банан"])).toBe("Банан");
  });

  it("strips parentheses and percent for comparison", () => {
    expect(chooseShoppingDisplayName(["Тыква (очищенная)", "Тыква"])).toBe("Тыква");
  });

  it("returns single name cleaned and trimmed", () => {
    expect(chooseShoppingDisplayName(["  Сливки 10%  "])).toBe("Сливки");
  });
});

describe("SPOON_TO_ML", () => {
  it("tbsp=15, tsp=5", () => {
    expect(SPOON_TO_ML.tbsp).toBe(15);
    expect(SPOON_TO_ML.tsp).toBe(5);
  });
});
