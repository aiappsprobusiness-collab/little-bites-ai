import { describe, expect, it } from "vitest";
import { getRemainingRecipesText } from "./recipePickHintCopy";

describe("getRemainingRecipesText", () => {
  const limit = 5;

  it("shows 0 of 5 when no attempts left", () => {
    expect(getRemainingRecipesText(0, limit)).toBe("Осталось: 0 из 5 подборов");
  });

  it("shows remaining of 5 for partial use", () => {
    expect(getRemainingRecipesText(1, limit)).toBe("Осталось: 1 из 5 подборов");
    expect(getRemainingRecipesText(2, limit)).toBe("Осталось: 2 из 5 подборов");
    expect(getRemainingRecipesText(5, limit)).toBe("Осталось: 5 из 5 подборов");
  });

  it("clamps negative remaining to 0", () => {
    expect(getRemainingRecipesText(-1, limit)).toBe("Осталось: 0 из 5 подборов");
  });

  it("uses correct plural for limit 2", () => {
    expect(getRemainingRecipesText(1, 2)).toBe("Осталось: 1 из 2 подбора");
    expect(getRemainingRecipesText(0, 2)).toBe("Осталось: 0 из 2 подбора");
  });
});
