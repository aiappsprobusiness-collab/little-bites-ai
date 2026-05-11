import { describe, expect, it } from "vitest";
import { isPantryStapleExcludedFromShopping } from "./pantryStaplesShopping";

describe("isPantryStapleExcludedFromShopping", () => {
  it("excludes salt/pepper to taste", () => {
    expect(
      isPantryStapleExcludedFromShopping({
        name: "соль",
        display_text: "соль — по вкусу",
      }),
    ).toBe(true);
    expect(
      isPantryStapleExcludedFromShopping({
        name: "перец чёрный молотый",
        display_text: "перец чёрный молотый — по вкусу",
      }),
    ).toBe(true);
  });

  it("excludes water and cooking oils", () => {
    expect(
      isPantryStapleExcludedFromShopping({
        name: "вода",
        display_text: "вода — 500 мл",
      }),
    ).toBe(true);
    expect(
      isPantryStapleExcludedFromShopping({
        name: "масло оливковое",
        display_text: "масло оливковое — 2 ст. л.",
      }),
    ).toBe(true);
  });

  it("keeps bell pepper and butter", () => {
    expect(
      isPantryStapleExcludedFromShopping({
        name: "перец болгарский",
        display_text: "перец болгарский — 150 г",
      }),
    ).toBe(false);
    expect(
      isPantryStapleExcludedFromShopping({
        name: "масло",
        display_text: "масло сливочное — 30 г",
      }),
    ).toBe(false);
  });

  it("excludes plain salt line", () => {
    expect(
      isPantryStapleExcludedFromShopping({
        name: "соль",
        display_text: "соль — 5 г",
      }),
    ).toBe(true);
  });
});
