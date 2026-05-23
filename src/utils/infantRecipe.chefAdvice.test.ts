import { describe, expect, it } from "vitest";
import { getChefAdviceCardPresentation } from "./infantRecipe";

describe("getChefAdviceCardPresentation", () => {
  it("прикорм: нейтральный стиль", () => {
    expect(
      getChefAdviceCardPresentation({
        recipe: { max_age_months: 6 },
        isChefTip: true,
      }),
    ).toEqual({ title: "Подсказка для мамы", isChefTip: false });
  });

  it("не прикорм: оливковый стиль при isChefTip true", () => {
    expect(
      getChefAdviceCardPresentation({
        recipe: { max_age_months: 24 },
        isChefTip: true,
      }),
    ).toEqual({ title: "Совет от шефа", isChefTip: true });
  });
});
