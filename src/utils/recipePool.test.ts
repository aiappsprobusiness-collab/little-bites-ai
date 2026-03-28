import { describe, it, expect } from "vitest";
import { passesProfileFilter, memberHasDislikesForPool } from "./recipePool";
import { POOL_SOURCES } from "./recipeCanonical";

describe("passesProfileFilter dislikes + ingredients (паритет с Edge)", () => {
  const baseRecipe = {
    title: "Суп с морковью",
    description: "Мягкий обед без ярких акцентов.",
    tags: [] as string[],
    recipe_ingredients: [{ name: "Морковь", display_text: "Морковь — 50 г" }],
  };

  it("фильтрует рецепт, если dislike только в ингредиентах (лук)", () => {
    const r = {
      ...baseRecipe,
      recipe_ingredients: [{ name: "Репчатый лук", display_text: "Лук — 20 г" }],
    };
    const res = passesProfileFilter(r, { dislikes: ["лук"] });
    expect(res.pass).toBe(false);
    expect(res.reason).toBe("preference");
  });

  it("не отсекает по луку, если в тексте и составе лука нет", () => {
    const res = passesProfileFilter(baseRecipe, { dislikes: ["лук"] });
    expect(res.pass).toBe(true);
  });
});

describe("memberHasDislikesForPool", () => {
  it("false при пустом списке или только пустых строк", () => {
    expect(memberHasDislikesForPool({ dislikes: [] })).toBe(false);
    expect(memberHasDislikesForPool({ dislikes: ["", "  "] })).toBe(false);
  });

  it("true при непустом dislike", () => {
    expect(memberHasDislikesForPool({ dislikes: ["лук"] })).toBe(true);
  });
});

describe("POOL_SOURCES (паритет с Edge generate-plan)", () => {
  it("включает starter вместе с seed и user/AI источниками", () => {
    expect(POOL_SOURCES).toContain("starter");
    expect(POOL_SOURCES).toContain("seed");
    expect(POOL_SOURCES).toContain("manual");
    expect(POOL_SOURCES).toContain("week_ai");
    expect(POOL_SOURCES).toContain("chat_ai");
    expect(POOL_SOURCES.length).toBe(5);
  });
});
