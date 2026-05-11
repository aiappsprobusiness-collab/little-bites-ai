import { describe, expect, it } from "vitest";
import {
  appendCanonicalGramSuffix,
  tryHouseholdCanonicalHeuristic,
} from "@shared/ingredientHouseholdCanonicalHeuristic.ts";

describe("tryHouseholdCanonicalHeuristic", () => {
  it("garlic cloves", () => {
    const r = tryHouseholdCanonicalHeuristic({
      name: "чеснок",
      display_text: "чеснок — 2 зубчика",
      amount: "2",
      unit: null,
    });
    expect(r?.canonical_amount).toBe(10);
    expect(r?.canonical_unit).toBe("g");
  });

  it("bread slices", () => {
    const r = tryHouseholdCanonicalHeuristic({
      name: "хлеб",
      display_text: "хлеб — 2 ломтика",
      amount: null,
      unit: null,
    });
    expect(r?.canonical_amount).toBe(56);
    expect(r?.heuristic).toBe("bread_slices_g");
  });

  it("append gram suffix", () => {
    expect(appendCanonicalGramSuffix("чеснок — 1 зубчик", 5)).toContain("= 5 г");
  });
});
