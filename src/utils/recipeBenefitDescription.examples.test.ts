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

  it("несколько разных seed с одними целями дают заметно разные формулировки", () => {
    const goals = ["balanced", "brain_development", "iron_support"] as const;
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ];
    const texts = ids.map((id) =>
      buildRecipeBenefitDescription({ recipeId: id, goals: [...goals] })
    );
    const unique = new Set(texts);
    expect(unique.size).toBeGreaterThanOrEqual(4);
  });

  it("разные recipeId при одинаковых целях дают разный текст (без коллизии mod-8 по слотам)", () => {
    const goals = ["balanced", "brain_development", "iron_support"] as const;
    expect(
      buildRecipeBenefitDescription({
        recipeId: "acab46b4-fdfc-42eb-9fda-225b84da44cd",
        goals: [...goals],
      })
    ).not.toBe(
      buildRecipeBenefitDescription({
        recipeId: "6b5cf77c-09fd-499e-8a4a-b400051a0a8c",
        goals: [...goals],
      })
    );
  });

  it("фиксированные примеры (зависят от hash и пулов — менять при правке шаблонов)", () => {
    expect(
      buildRecipeBenefitDescription({
        recipeId: DEMO_RECIPE_UUID,
        goals: ["balanced", "brain_development", "iron_support"],
      })
    ).toBe(
      "Сбалансированное блюдо, которое хорошо подходит в дни, когда впереди много дел, требующих сосредоточенности, и хорошо вписывается в меню, где нужен дополнительный источник железа — спокойно по сытости."
    );

    expect(
      buildRecipeBenefitDescription({
        recipeId: DEMO_RECIPE_UUID,
        goals: ["balanced", "energy_boost"],
      })
    ).toBe(
      "Удачный сбалансированный приём пищи, который хорошо вписывается в меню для активных и насыщенных дней — остаётся понятным выбором."
    );

    expect(
      buildRecipeBenefitDescription({
        recipeId: DEMO_RECIPE_UUID,
        goals: ["gentle_digestion", "balanced"],
      })
    ).toBe(
      "Удачный сбалансированный приём пищи, который помогает сделать рацион мягче по ощущениям после еды — хорошо для обычных дней."
    );

    expect(
      buildRecipeBenefitDescription({
        recipeId: DEMO_RECIPE_UUID,
        goals: ["weight_gain"],
      })
    ).toBe(
      "По смыслу для рациона это даёт более плотную сытость и помогает усилить рацион — хорошо для обычных дней."
    );
  });
});
