import { describe, expect, it } from "vitest";
import {
  enrichIngredientMeasurementForSave,
  formatIngredientMeasurement,
  shouldUseDualMeasurement,
  tryParseHouseholdFromText,
} from "@shared/ingredientMeasurementDisplay";

describe("ingredientMeasurementDisplay", () => {
  it("shouldUseDualMeasurement: meat by name false", () => {
    expect(
      shouldUseDualMeasurement({
        name: "Говядина",
        canonical_amount: 300,
        canonical_unit: "g",
        category: "meat",
      }),
    ).toBe(false);
  });

  it("shouldUseDualMeasurement: garlic true", () => {
    expect(
      shouldUseDualMeasurement({
        name: "Чеснок",
        canonical_amount: 10,
        canonical_unit: "g",
        category: "vegetables",
      }),
    ).toBe(true);
  });

  it("enrich: garlic 10g → dual", () => {
    const r = enrichIngredientMeasurementForSave({
      name: "Чеснок",
      display_text: "Чеснок — 10 г",
      canonical_amount: 10,
      canonical_unit: "g",
      category: "vegetables",
    });
    expect(r.measurement_mode).toBe("dual");
    expect(r.display_text).toContain("=");
    expect(r.display_text).toMatch(/10 г/);
  });

  it("formatIngredientMeasurement scales dual", () => {
    const line = formatIngredientMeasurement(
      {
        name: "Чеснок",
        measurement_mode: "dual",
        display_amount: 2,
        display_unit: "зубчик",
        canonical_amount: 10,
        canonical_unit: "g",
      },
      { servingMultiplier: 2 },
    );
    expect(line).toContain("20 г");
  });

  it("tryParseHouseholdFromText", () => {
    const p = tryParseHouseholdFromText("Масло — 1 ст. л.", "Масло");
    expect(p?.amount).toBe(1);
    expect(p?.unitRaw).toMatch(/ст/i);
  });
});
