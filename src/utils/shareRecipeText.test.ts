import { describe, it, expect } from "vitest";
import { buildRecipeShareText, buildRecipeShareTextShort, getShareSignature, SHARE_APP_URL } from "./shareRecipeText";

describe("shareRecipeText", () => {
  const signature = getShareSignature();

  /** Ожидаемый хвост: перенос, подпись, перенос, URL (чистый, без markdown). */
  const expectedTail = `\n${signature.line}\n${signature.url}`;

  it("built share text always contains signature line and app URL at the end", () => {
    const minimal = buildRecipeShareText({
      title: "Тест",
      recipeId: "abc-123",
      ingredients: [],
    });
    expect(minimal).toContain(signature.line);
    expect(minimal).toContain(signature.url);
    expect(minimal.endsWith(expectedTail)).toBe(true);
  });

  it("share text ends with signature line and site URL on separate lines (no markdown)", () => {
    const text = buildRecipeShareText({
      title: "Хвост",
      recipeId: "id",
      ingredients: [],
    });
    expect(text.endsWith("\n— Рецепт из приложения Mom Recipes\nhttps://momrecipes.online")).toBe(true);
    expect(text.endsWith(`\n${signature.line}\n${signature.url}`)).toBe(true);
    expect(signature.url).toBe(SHARE_APP_URL);
  });

  it("signature is present with full recipe (steps, chef, meal)", () => {
    const full = buildRecipeShareText({
      title: "Овсянка",
      description: "Полезно для пищеварения.",
      cooking_time_minutes: 15,
      recipeId: "uuid-recipe",
      ingredients: [
        { name: "Овсяные хлопья", amount: 50, unit: "г" },
        { name: "Молоко", display_text: "100 мл" },
      ],
      steps: [
        { step_number: 1, instruction: "Смешать хлопья с молоком." },
        { step_number: 2, instruction: "Варить 5 минут." },
      ],
      chefAdvice: "Добавьте ягоды по вкусу.",
      meal_type: "breakfast",
    });
    expect(full).toContain(signature.line);
    expect(full).toContain(signature.url);
    expect(full).toContain("👩‍🍳 Приготовление:");
    expect(full).toContain("1) Смешать");
    expect(full).toContain("👩‍🍳✨ Совет от шефа:");
    expect(full).toContain("🥣 Завтрак");
    expect(full.endsWith(expectedTail)).toBe(true);
  });

  it("infant recipe uses mom advice label and infant description heading", () => {
    const infant = buildRecipeShareText({
      title: "Пюре",
      description: "Мягкое пюре для этапа прикорма.",
      cooking_time_minutes: 10,
      recipeId: "uuid-infant",
      ingredients: [],
      chefAdvice: "Текстура будет нежной при мягком разваривании.",
      meal_type: "breakfast",
      max_age_months: 11,
    });
    expect(infant).toContain("👩‍🍳✨ Подсказка для мамы:");
    expect(infant).not.toContain("👩‍🍳✨ Совет от шефа:");
    expect(infant).toContain("💚 Текстура и этап прикорма:");
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

  it("includes preparation fallback when no steps", () => {
    const text = buildRecipeShareText({
      title: "Без шагов",
      recipeId: "id",
      ingredients: [],
    });
    expect(text).toContain("👩‍🍳 Приготовление:");
    expect(text).toContain("следуйте привычной технологии");
  });

  it("does not include chef advice block when chefAdvice is null", () => {
    const text = buildRecipeShareText({
      title: "Блюдо",
      recipeId: "id",
      ingredients: [{ name: "Вода", amount: 100, unit: "мл" }],
      steps: [{ step_number: 1, instruction: "Смешать." }],
      chefAdvice: null,
    });
    expect(text).not.toContain("👩‍🍳✨ Совет от шефа:");
  });

  describe("buildRecipeShareTextShort", () => {
    it("returns recipe share line, title, link and product value", () => {
      const url = "https://momrecipes.online/r/abc123";
      const text = buildRecipeShareTextShort("Омлет с кабачком", url);
      expect(text).toContain("🍽 Делюсь рецептом из Mom Recipes");
      expect(text).toContain("Омлет с кабачком");
      expect(text).toContain("Посмотреть рецепт:");
      expect(text).toContain(url);
      expect(text).toContain("собрать меню для всей семьи");
      expect(text).not.toContain("Ингредиенты");
      expect(text).not.toContain("Приготовление");
    });
  });
});
