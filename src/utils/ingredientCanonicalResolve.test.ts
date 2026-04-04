import { describe, expect, it } from "vitest";
import {
  fillCanonicalForSeedIngredient,
  normalizeIngredientUnit,
  parseDisplayTextTailForAmountUnit,
  resolveCanonicalFromAmountAndUnit,
  tryResolveCanonicalFromIngredientFields,
} from "@shared/ingredientCanonicalResolve";

describe("ingredientCanonicalResolve", () => {
  it("normalizeIngredientUnit: г → g, кг → kg", () => {
    expect(normalizeIngredientUnit("г")).toBe("g");
    expect(normalizeIngredientUnit("кг")).toBe("kg");
    expect(normalizeIngredientUnit("мл")).toBe("ml");
    expect(normalizeIngredientUnit("ч. л.")).toBe("tsp");
  });

  it("resolveCanonicalFromAmountAndUnit: 85 г → 85 g", () => {
    const r = resolveCanonicalFromAmountAndUnit(85, "г");
    expect(r).toEqual({ canonical_amount: 85, canonical_unit: "g" });
  });

  it("0.5 кг → 500 g", () => {
    const r = resolveCanonicalFromAmountAndUnit(0.5, "кг");
    expect(r).toEqual({ canonical_amount: 500, canonical_unit: "g" });
  });

  it("1 л → 1000 ml", () => {
    const r = resolveCanonicalFromAmountAndUnit(1, "л");
    expect(r).toEqual({ canonical_amount: 1000, canonical_unit: "ml" });
  });

  it("tryResolve: amount+unit приоритетнее display_text", () => {
    const r = tryResolveCanonicalFromIngredientFields({
      amount: 10,
      unit: "г",
      display_text: "Игнор — 999 кг",
    });
    expect(r?.canonical_amount).toBe(10);
    expect(r?.source).toBe("amount_unit");
  });

  it("fallback display_text: «Морковь — 50 г»", () => {
    const r = tryResolveCanonicalFromIngredientFields({
      amount: null,
      unit: null,
      display_text: "Морковь — 50 г",
    });
    expect(r).toEqual({ canonical_amount: 50, canonical_unit: "g", source: "display_text" });
  });

  it("unsupported unit → null", () => {
    expect(tryResolveCanonicalFromIngredientFields({ amount: 1, unit: "щепотка", display_text: null })).toBeNull();
  });

  it("fillCanonicalForSeedIngredient: сохраняет валидный JSON-канон", () => {
    const r = fillCanonicalForSeedIngredient({
      amount: 10,
      unit: "г",
      canonical_amount: 10,
      canonical_unit: "g",
      display_text: "X",
    });
    expect(r).toEqual({ canonical_amount: 10, canonical_unit: "g" });
  });

  it("parseDisplayTextTailForAmountUnit", () => {
    expect(parseDisplayTextTailForAmountUnit("Яблоко — 1 шт.")?.amount).toBe(1);
    expect(parseDisplayTextTailForAmountUnit("без тире") == null).toBe(true);
  });
});
