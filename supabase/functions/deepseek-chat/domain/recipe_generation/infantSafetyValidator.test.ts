import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { validateInfantRecipe } from "./infantSafetyValidator.ts";
import type { RecipeJson } from "../../recipeSchema.ts";

function baseRecipe(partial: Partial<RecipeJson>): RecipeJson {
  return {
    title: "Пюре",
    description: "Мягкое однородное пюре для прикорма.",
    mealType: "snack",
    servings: 1,
    cookingTimeMinutes: 15,
    ingredients: [{ name: "тыква", amount: "50 г" }],
    steps: ["Очистить", "Приготовить на пару", "Размять вилкой до пюре"],
    chefAdvice: null,
    nutrition: null,
    ...partial,
  } as RecipeJson;
}

Deno.test("validator: простой infant-рецепт проходит (6_7)", () => {
  const r = baseRecipe({});
  const v = validateInfantRecipe(r, { stage: "6_7", ageMonths: 6 });
  assertEquals(v.ok, true);
  assertEquals(v.reason_code, "ok");
});

Deno.test("validator: слишком много ингредиентов → too_many_ingredients_for_stage", () => {
  const ingredients = Array.from({ length: 10 }, (_, i) => ({ name: `инг_${i}`, amount: "10 г" }));
  const r = baseRecipe({ ingredients });
  const v = validateInfantRecipe(r, { stage: "6_7", ageMonths: 6 });
  assertEquals(v.ok, false);
  assertEquals(v.reason_code, "too_many_ingredients_for_stage");
  assertEquals(v.severity, "hard");
});

Deno.test("validator: жареное → adult_style_dish", () => {
  const r = baseRecipe({
    title: "Жареные овощи",
    steps: ["Нарезать", "Подавать"],
  });
  const v = validateInfantRecipe(r, { stage: "8_9", ageMonths: 8 });
  assertEquals(v.ok, false);
  assertEquals(v.reason_code, "adult_style_dish");
});

Deno.test("validator: кусочки на этапе 6_7 → invalid_texture_for_stage", () => {
  const r = baseRecipe({
    description: "Нарежьте кубиками и подавайте.",
    steps: ["Нарезать кубиками"],
  });
  const v = validateInfantRecipe(r, { stage: "6_7", ageMonths: 6 });
  assertEquals(v.ok, false);
  assertEquals(v.reason_code, "invalid_texture_for_stage");
});

Deno.test("validator: ровно max ингредиентов на этапе 6_7 → soft too_many_new_elements_at_once", () => {
  const ingredients = Array.from({ length: 5 }, (_, i) => ({ name: `инг_${i}`, amount: "10 г" }));
  const r = baseRecipe({ ingredients });
  const v = validateInfantRecipe(r, { stage: "6_7", ageMonths: 7 });
  assertEquals(v.ok, false);
  assertEquals(v.reason_code, "too_many_new_elements_at_once");
  assertEquals(v.severity, "soft");
});

Deno.test("validator: invalid_age_range вне 6–11", () => {
  const r = baseRecipe({});
  const v = validateInfantRecipe(r, { stage: "6_7", ageMonths: 4 });
  assertEquals(v.ok, false);
  assertEquals(v.reason_code, "invalid_age_range");
});
