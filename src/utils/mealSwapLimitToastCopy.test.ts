import { describe, expect, it } from "vitest";
import {
  MEAL_SWAP_LIMIT_TOAST_TITLE,
  getMealSwapLimitToastDescription,
} from "./mealSwapLimitToastCopy";

describe("mealSwapLimitToastCopy", () => {
  it("фиксированный текст для лимита 2", () => {
    expect(getMealSwapLimitToastDescription(2)).toBe(
      "Сегодня можно поменять 2 блюда. В полной версии — без ограничений.",
    );
  });

  it("заголовок без слова «пул»", () => {
    expect(MEAL_SWAP_LIMIT_TOAST_TITLE).toBe("Замены на сегодня закончились");
    expect(getMealSwapLimitToastDescription()).not.toMatch(/пул/i);
  });
});
