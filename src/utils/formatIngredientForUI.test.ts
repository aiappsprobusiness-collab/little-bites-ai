import { describe, expect, it } from "vitest";
import { formatIngredientForUI } from "@shared/formatIngredientForUI";

describe("formatIngredientForUI", () => {
  it("recipe dual: только канон", () => {
    expect(
      formatIngredientForUI(
        {
          name: "Морковь",
          measurement_mode: "dual",
          display_amount: 1,
          display_unit: "шт.",
          canonical_amount: 90,
          canonical_unit: "g",
        },
        "recipe",
        { servingMultiplier: 1 },
      ),
    ).toBe("90 г");
  });

  it("shopping dual: составная строка с ≈", () => {
    const s = formatIngredientForUI(
      {
        name: "Кунжут",
        measurement_mode: "dual",
        display_amount: 1,
        display_unit: "ч. л.",
        canonical_amount: 5,
        canonical_unit: "ml",
      },
      "shopping",
      { servingMultiplier: 1 },
    );
    expect(s).toContain("≈");
    expect(s).toContain("5");
    expect(s.toLowerCase()).toContain("мл");
  });

  it("shopping dual: display_quantity_text приоритетнее", () => {
    expect(
      formatIngredientForUI(
        {
          name: "X",
          measurement_mode: "dual",
          display_quantity_text: "1 небольшой кочан",
          display_amount: 1,
          display_unit: "шт.",
          canonical_amount: 200,
          canonical_unit: "g",
        },
        "shopping",
      ),
    ).toBe("1 небольшой кочан");
  });

  it("canonical_only: display_text (чеснок)", () => {
    expect(
      formatIngredientForUI(
        {
          name: "Чеснок",
          measurement_mode: "canonical_only",
          display_text: "1 зубчик",
        },
        "recipe",
      ),
    ).toBe("1 зубчик");
  });

  it("recipe dual масштаб порций", () => {
    expect(
      formatIngredientForUI(
        {
          name: "Лук",
          measurement_mode: "dual",
          display_amount: 0.5,
          display_unit: "шт.",
          canonical_amount: 45,
          canonical_unit: "g",
        },
        "recipe",
        { servingMultiplier: 2 },
      ),
    ).toBe("90 г");
  });

  it("recipe dual: без g/ml канона — масштабирует бытовую часть", () => {
    expect(
      formatIngredientForUI(
        {
          name: "Яйцо",
          measurement_mode: "dual",
          display_amount: 1,
          display_unit: "шт.",
          canonical_amount: 3,
          canonical_unit: "pcs",
        },
        "recipe",
        { servingMultiplier: 4 },
      ),
    ).toBe("4 шт.");
  });
});
