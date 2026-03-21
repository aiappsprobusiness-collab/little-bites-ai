import { describe, it, expect } from "vitest";
import {
  buildRecipeBenefitDescription,
  pickPriorityAccentGoals,
} from "./recipeBenefitDescription";

/** Реальный id демо-рецепта из WelcomeRecipeBlock (стабильный для smoke). */
const DEMO_RECIPE_UUID = "4dcaf358-5aea-4806-89c1-ffe02e96d8e3";

describe("recipeBenefitDescription — примеры для реального UUID", () => {
  it("pickPriorityAccentGoals: balanced + порядок приоритетов", () => {
    expect(
      pickPriorityAccentGoals(["balanced", "iron_support", "brain_development"])
    ).toEqual({
      hasBalanced: true,
      accents: ["brain_development", "iron_support"],
    });
  });

  it("детерминизм: два вызова с теми же входами дают одну строку", () => {
    const input = {
      recipeId: DEMO_RECIPE_UUID,
      goals: ["balanced", "brain_development", "iron_support"],
    };
    expect(buildRecipeBenefitDescription(input)).toBe(
      buildRecipeBenefitDescription(input)
    );
  });

  it("фиксированные примеры (зависят от hash и пулов — менять при правке шаблонов)", () => {
    expect(
      buildRecipeBenefitDescription({
        recipeId: DEMO_RECIPE_UUID,
        goals: ["balanced", "brain_development", "iron_support"],
      })
    ).toBe(
      "Ровный по питательности вариант, который подходит для дней учёбы или напряжённой работы и помогает усилить железосодержащую часть рациона."
    );

    expect(
      buildRecipeBenefitDescription({
        recipeId: DEMO_RECIPE_UUID,
        goals: ["balanced", "energy_boost"],
      })
    ).toBe(
      "Ровный по питательности вариант, который может помочь сделать день более ровным по силам и сытости."
    );

    expect(
      buildRecipeBenefitDescription({
        recipeId: DEMO_RECIPE_UUID,
        goals: ["gentle_digestion", "balanced"],
      })
    ).toBe(
      "Хороший вариант для повседневного меню, который поддерживает более спокойный и комфортный формат питания."
    );

    expect(
      buildRecipeBenefitDescription({
        recipeId: DEMO_RECIPE_UUID,
        goals: ["weight_gain"],
      })
    ).toBe(
      "Уместный вариант для меню с акцентом на набор веса или на дополнительную питательность."
    );
  });
});
