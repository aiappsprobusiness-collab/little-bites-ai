/**
 * Контрактные тесты: парсинг/валидация рецепта, санитизация, минимальный fallback.
 * Запуск: из supabase/functions: deno test deepseek-chat/domain/recipe_io/recipe_io.test.ts --allow-read
 */
import { validateRecipe } from "./index.ts";
import { parseAndValidateRecipeJsonFromString } from "../../recipeSchema.ts";
import { sanitizeRecipeText, sanitizeMealMentions, getMinimalRecipe } from "./index.ts";

Deno.test("validateRecipe: валидный JSON рецепт проходит", () => {
  const validJson = `{
    "title": "Тестовая каша",
    "description": "Вкусная каша из риса.",
    "ingredients": [{"name": "Рис", "amount": "50 г"}, {"name": "Вода", "amount": "100 мл"}, {"name": "Соль", "amount": "по вкусу"}],
    "steps": ["Варить 15 минут.", "Подавать."],
    "cookingTimeMinutes": 15,
    "mealType": "breakfast",
    "servings": 1,
    "chefAdvice": null,
    "nutrition": {"kcal_per_serving": 120, "protein_g_per_serving": 2, "fat_g_per_serving": 1, "carbs_g_per_serving": 25, "is_estimate": true}
  }`;
  const result = validateRecipe(validJson, parseAndValidateRecipeJsonFromString);
  if (result.stage !== "ok" || !result.valid) {
    throw new Error(`Expected stage ok and valid recipe, got: ${result.stage}, ${JSON.stringify(result)}`);
  }
});

Deno.test("validateRecipe: текст без JSON — stage extract", () => {
  const result = validateRecipe("Просто текст без JSON", parseAndValidateRecipeJsonFromString);
  if (result.stage !== "extract") {
    throw new Error(`Expected stage extract, got: ${result.stage}`);
  }
});

Deno.test("sanitizeRecipeText: убирает упоминания для ребёнка", () => {
  const out = sanitizeRecipeText("Для вашего ребёнка подойдёт эта каша. Без соли.");
  if (out.toLowerCase().includes("ребёнк") || out.toLowerCase().includes("child")) {
    throw new Error(`Personal refs should be stripped, got: ${out}`);
  }
});

Deno.test("sanitizeMealMentions: убирает тип приёма пищи", () => {
  const out = sanitizeMealMentions("Идеально на завтрак. Подойдёт для обеда.");
  if (out.toLowerCase().includes("завтрак") || out.toLowerCase().includes("обед")) {
    throw new Error(`Meal mentions should be stripped, got: ${out}`);
  }
});

Deno.test("getMinimalRecipe: возвращает валидный рецепт с переданным mealType", () => {
  const r = getMinimalRecipe("lunch");
  if (r.mealType !== "lunch" || !r.title || !Array.isArray(r.ingredients) || r.ingredients.length < 3) {
    throw new Error(`Minimal recipe must have mealType lunch and 3+ ingredients, got: ${JSON.stringify(r)}`);
  }
});

Deno.test("getMinimalRecipe: неизвестный mealType — snack", () => {
  const r = getMinimalRecipe("unknown");
  if (r.mealType !== "snack") {
    throw new Error(`Unknown mealType must fallback to snack, got: ${r.mealType}`);
  }
});
