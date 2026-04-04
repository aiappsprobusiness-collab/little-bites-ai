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

  it("enrich: явные 2 зубчика при 10 г → dual", () => {
    const r = enrichIngredientMeasurementForSave({
      name: "Чеснок",
      display_text: "Чеснок — 2 зубчика",
      canonical_amount: 10,
      canonical_unit: "g",
      category: "vegetables",
    });
    expect(r.measurement_mode).toBe("dual");
    expect(r.display_text).toMatch(/2/);
    expect(r.display_text).toMatch(/10 г/);
  });

  it("enrich: явная 1 ст. л. масла при 17 г → dual", () => {
    const r = enrichIngredientMeasurementForSave({
      name: "Масло оливковое",
      display_text: "Масло оливковое — 1 ст. л.",
      canonical_amount: 17,
      canonical_unit: "g",
      category: "fats",
    });
    expect(r.measurement_mode).toBe("dual");
    expect(r.display_text).toContain("ст. л.");
  });

  it("enrich: явная 1 шт. при ~120 г яблока → dual", () => {
    const r = enrichIngredientMeasurementForSave({
      name: "Яблоко",
      display_text: "Яблоко — 1 шт.",
      canonical_amount: 120,
      canonical_unit: "g",
      category: "fruits",
    });
    expect(r.measurement_mode).toBe("dual");
    expect(r.display_text).toMatch(/шт/);
  });

  it("enrich: крупный якорь без явного шт (напр. 150 г овоща) → canonical_only", () => {
    const r = enrichIngredientMeasurementForSave({
      name: "Тыква",
      display_text: "Тыква — 150 г",
      canonical_amount: 150,
      canonical_unit: "g",
      category: "vegetables",
    });
    expect(r.measurement_mode).toBe("canonical_only");
  });

  it("formatIngredientMeasurement: при масштабе с нечитаемым household — только канон", () => {
    const line = formatIngredientMeasurement(
      {
        name: "Чеснок",
        measurement_mode: "dual",
        display_amount: 1,
        display_unit: "зубчик",
        canonical_amount: 10,
        canonical_unit: "g",
      },
      { servingMultiplier: 2.17 },
    );
    expect(line).toMatch(/10|21|22/); // округлённый канон
    expect(line).toContain("г");
    expect(line).not.toContain("=");
  });
});
