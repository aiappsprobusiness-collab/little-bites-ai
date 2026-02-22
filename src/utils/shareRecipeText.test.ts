import { describe, it, expect } from "vitest";
import { buildRecipeShareText, getShareSignature } from "./shareRecipeText";

describe("shareRecipeText", () => {
  const signature = getShareSignature();

  it("built share text always contains signature line and app URL at the end", () => {
    const minimal = buildRecipeShareText({
      title: "Тест",
      recipeId: "abc-123",
      ingredients: [],
    });
    expect(minimal.endsWith(`${signature.line}\n${signature.url}`)).toBe(true);
    expect(minimal).toContain(signature.line);
    expect(minimal).toContain(signature.url);
  });

  it("signature is present with full recipe", () => {
    const full = buildRecipeShareText({
      title: "Овсянка",
      description: "Полезно для пищеварения.",
      cooking_time_minutes: 15,
      recipeId: "uuid-recipe",
      ingredients: [
        { name: "Овсяные хлопья", amount: 50, unit: "г" },
        { name: "Молоко", display_text: "100 мл" },
      ],
    });
    expect(full).toContain(signature.line);
    expect(full).toContain(signature.url);
    expect(full.endsWith(`${signature.line}\n${signature.url}`)).toBe(true);
  });

  it("uses plain newlines and no markdown", () => {
    const text = buildRecipeShareText({
      title: "A",
      recipeId: "id",
      ingredients: [],
    });
    expect(text).not.toMatch(/<br\s*\/?>/i);
    expect(text).not.toMatch(/\*\*|^#|\[.+\]\(/);
    expect(text).toContain("\n");
  });
});
