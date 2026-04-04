import { describe, expect, it } from "vitest";
import { evaluateCanonicalIngredientRow } from "@shared/ingredientCanonicalBackfill";

describe("ingredientCanonicalBackfill", () => {
  it("already_has_valid_canonical", () => {
    const ev = evaluateCanonicalIngredientRow({
      name: "Мука",
      amount: 100,
      unit: "г",
      display_text: "Мука — 100 г",
      canonical_amount: 100,
      canonical_unit: "g",
    });
    expect(ev.decision).toBe("skip");
    if (ev.decision === "skip") expect(ev.reason).toBe("already_has_valid_canonical");
  });

  it("parsed_from_amount_unit", () => {
    const ev = evaluateCanonicalIngredientRow({
      name: "Мука",
      amount: 100,
      unit: "г",
      display_text: "Мука — 100 г",
      canonical_amount: null,
      canonical_unit: null,
    });
    expect(ev.decision).toBe("update");
    if (ev.decision === "update") {
      expect(ev.patch).toEqual({ canonical_amount: 100, canonical_unit: "g" });
      expect(ev.reason).toBe("parsed_from_amount_unit");
    }
  });

  it("idempotency: после канона — skip", () => {
    const first = evaluateCanonicalIngredientRow({
      name: "Мука",
      amount: 100,
      unit: "г",
      display_text: "Мука — 100 г",
      canonical_amount: null,
      canonical_unit: null,
    });
    expect(first.decision).toBe("update");
    if (first.decision !== "update") throw new Error("expected update");
    const second = evaluateCanonicalIngredientRow({
      name: "Мука",
      amount: 100,
      unit: "г",
      display_text: "Мука — 100 г",
      canonical_amount: first.patch.canonical_amount,
      canonical_unit: first.patch.canonical_unit,
    });
    expect(second.decision).toBe("skip");
  });

  it("onlyMissingCanonical: битый частичный канон — skip", () => {
    const ev = evaluateCanonicalIngredientRow(
      {
        name: "X",
        amount: 10,
        unit: "г",
        display_text: "X — 10 г",
        canonical_amount: 10,
        canonical_unit: null,
      },
      { onlyMissingCanonical: true },
    );
    expect(ev.decision).toBe("skip");
    if (ev.decision === "skip") expect(ev.reason).toBe("skipped_only_missing_partial_or_broken");
  });
});
