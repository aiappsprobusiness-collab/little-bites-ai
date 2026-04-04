import { describe, expect, it } from "vitest";
import {
  parseSimpleNumericQuantity,
  resolveCanonicalForEnrichInput,
  resolveCanonicalForEnrichFromIngredient,
  tryResolveEnrichCanonicalFromParsedAmount,
} from "@shared/ingredientCanonicalForEnrich";

describe("ingredientCanonicalForEnrich", () => {
  it("resolveCanonicalForEnrichInput: 2 шт. → g для обычного продукта", () => {
    const r = resolveCanonicalForEnrichInput({ name: "Лук репчатый", amountLine: "2 шт.", llmCanonical: null });
    expect(r).toEqual({ amount: 180, unit: "g" });
  });

  it("resolveCanonicalForEnrichInput: банан + шт.", () => {
    const r = resolveCanonicalForEnrichInput({ name: "Банан", amountLine: "1 шт.", llmCanonical: null });
    expect(r).toEqual({ amount: 100, unit: "g" });
  });

  it("resolveCanonicalForEnrichInput: яйцо в хвосте", () => {
    const r = resolveCanonicalForEnrichInput({ name: "Яйцо куриное", amountLine: "1 яйцо", llmCanonical: null });
    expect(r).toEqual({ amount: 55, unit: "g" });
  });

  it("tryResolveEnrichCanonicalFromParsedAmount: ч. л. → ml", () => {
    const r = tryResolveEnrichCanonicalFromParsedAmount(2, "ч. л.", "Соль");
    expect(r).toEqual({ amount: 10, unit: "ml" });
  });

  it("parseSimpleNumericQuantity", () => {
    expect(parseSimpleNumericQuantity("2 шт.")).toEqual({ amount: 2, rawUnit: "шт." });
  });

  it("resolveCanonicalForEnrichFromIngredient: amount + unit на клиенте", () => {
    const r = resolveCanonicalForEnrichFromIngredient({
      name: "Молоко",
      amount: "200",
      unit: "мл",
      display_text: "Молоко — 200 мл",
      canonical_amount: null,
      canonical_unit: null,
    });
    expect(r).toEqual({ amount: 200, unit: "ml" });
  });
});
