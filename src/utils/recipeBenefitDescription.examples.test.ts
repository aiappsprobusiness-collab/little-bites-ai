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
      context: "child" as const,
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
        context: "child",
      })
    ).toBe(
      "Питательное блюдо на каждый день, которое поддерживает внимание в спокойном темпе и делает рацион более насыщенным по железу."
    );

    expect(
      buildRecipeBenefitDescription({
        recipeId: DEMO_RECIPE_UUID,
        goals: ["balanced", "energy_boost"],
        context: "adult",
      })
    ).toBe(
      "Удобный для повседневного рациона вариант, который поддерживает стабильную энергию."
    );

    expect(
      buildRecipeBenefitDescription({
        recipeId: DEMO_RECIPE_UUID,
        goals: ["gentle_digestion", "balanced"],
        context: "family",
      })
    ).toBe(
      "Сбалансированное блюдо для обычных дней, которое мягко подходит для повседневного меню."
    );

    expect(
      buildRecipeBenefitDescription({
        recipeId: DEMO_RECIPE_UUID,
        goals: ["weight_gain"],
        context: "child",
      })
    ).toBe("Сытное и питательное блюдо без ощущения тяжести.");
  });
});
