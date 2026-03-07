/**
 * Тесты локального repair и решения о retry для recipe JSON.
 * Запуск: из supabase/functions: deno test deepseek-chat/recipeSchema.test.ts --allow-read
 */
import { validateRecipe } from "../_shared/parsing/validateRecipe.ts";
import {
  parseAndValidateRecipeJsonFromString,
  getLastRecipeParseDiagnostics,
  resetLastRecipeValidationState,
  decideRecipeRecovery,
} from "./recipeSchema.ts";

function buildRecipeJson(mealType: string): string {
  return `{
    "title": "Тестовая запеканка",
    "description": "Нежная запеканка с творогом и яблоком.",
    "ingredients": [
      {"name": "Творог", "amount": "200 г"},
      {"name": "Яйцо", "amount": "1 шт."},
      {"name": "Яблоко", "amount": "80 г"}
    ],
    "steps": ["Смешайте ингредиенты.", "Переложите в форму.", "Запекайте до готовности."],
    "cookingTimeMinutes": 35,
    "mealType": ${JSON.stringify(mealType)},
    "servings": 1,
    "chefAdvice": "Дайте запеканке постоять 5 минут после духовки.",
    "nutrition": {"kcal_per_serving": 320, "protein_g_per_serving": 25, "fat_g_per_serving": 12, "carbs_g_per_serving": 28, "is_estimate": true}
  }`;
}

Deno.test("recipeSchema: mealType='завтрак' локально чинится в breakfast без retryFixJson", () => {
  resetLastRecipeValidationState();
  const result = validateRecipe(buildRecipeJson("завтрак"), parseAndValidateRecipeJsonFromString);
  const diagnostics = getLastRecipeParseDiagnostics();
  const decision = decideRecipeRecovery(result.stage, diagnostics);
  if (result.stage !== "ok" || !result.valid) {
    throw new Error(`Expected valid result after local repair, got: ${JSON.stringify(result)}`);
  }
  if (result.valid.mealType !== "breakfast") {
    throw new Error(`Expected breakfast, got: ${result.valid.mealType}`);
  }
  if (!diagnostics.localRepairApplied || !diagnostics.repairedFields.includes("mealType")) {
    throw new Error(`Expected local repair for mealType, got: ${JSON.stringify(diagnostics)}`);
  }
  if (decision.strategy !== "none") {
    throw new Error(`Expected no retry strategy after successful repair, got: ${JSON.stringify(decision)}`);
  }
});

Deno.test("recipeSchema: mealType='  Ужин  ' локально чинится в dinner без retryFixJson", () => {
  resetLastRecipeValidationState();
  const result = validateRecipe(buildRecipeJson("  Ужин  "), parseAndValidateRecipeJsonFromString);
  const diagnostics = getLastRecipeParseDiagnostics();
  const decision = decideRecipeRecovery(result.stage, diagnostics);
  if (result.stage !== "ok" || !result.valid || result.valid.mealType !== "dinner") {
    throw new Error(`Expected dinner after local repair, got: ${JSON.stringify(result)}`);
  }
  if (decision.strategy !== "none") {
    throw new Error(`Expected no retry after local repair, got: ${JSON.stringify(decision)}`);
  }
});

Deno.test("recipeSchema: mealType='полдник' локально чинится в snack без retryFixJson", () => {
  resetLastRecipeValidationState();
  const result = validateRecipe(buildRecipeJson("полдник"), parseAndValidateRecipeJsonFromString);
  const diagnostics = getLastRecipeParseDiagnostics();
  const decision = decideRecipeRecovery(result.stage, diagnostics);
  if (result.stage !== "ok" || !result.valid || result.valid.mealType !== "snack") {
    throw new Error(`Expected snack after local repair, got: ${JSON.stringify(result)}`);
  }
  if (decision.strategy !== "none") {
    throw new Error(`Expected no retry after local repair, got: ${JSON.stringify(decision)}`);
  }
});

Deno.test("recipeSchema: полностью битый JSON идёт в llm_retry path", () => {
  resetLastRecipeValidationState();
  const result = validateRecipe("{\"title\": \"broken\"", parseAndValidateRecipeJsonFromString);
  const decision = decideRecipeRecovery(result.stage, getLastRecipeParseDiagnostics());
  if (decision.strategy !== "llm_retry") {
    throw new Error(`Expected llm_retry for broken JSON, got: ${JSON.stringify({ result, decision })}`);
  }
});

Deno.test("recipeSchema: валидный JSON не требует retryFixJson", () => {
  resetLastRecipeValidationState();
  const result = validateRecipe(buildRecipeJson("breakfast"), parseAndValidateRecipeJsonFromString);
  const decision = decideRecipeRecovery(result.stage, getLastRecipeParseDiagnostics());
  if (result.stage !== "ok" || !result.valid) {
    throw new Error(`Expected valid result, got: ${JSON.stringify(result)}`);
  }
  if (decision.strategy !== "none") {
    throw new Error(`Expected no retry for valid JSON, got: ${JSON.stringify(decision)}`);
  }
});

Deno.test("recipeSchema: nutrition строками с единицами нормализуется без потери КБЖУ", () => {
  resetLastRecipeValidationState();
  const result = validateRecipe(`{
    "title": "Треска с картофелем",
    "description": "Запечённая рыба с мягким гарниром.",
    "ingredients": [
      {"name": "Филе трески", "amount": "150 г"},
      {"name": "Картофель", "amount": "100 г"},
      {"name": "Масло", "amount": "1 ч.л."}
    ],
    "steps": ["Подготовьте ингредиенты.", "Выложите в форму.", "Запекайте до готовности."],
    "cookingTimeMinutes": 30,
    "mealType": "dinner",
    "servings": 1,
    "chefAdvice": "Смажьте форму тонким слоем масла.",
    "nutrition": {
      "calories": "320 kcal",
      "protein": "25 г",
      "fat": "12 г",
      "carbs": "28 г",
      "is_estimate": true
    }
  }`, parseAndValidateRecipeJsonFromString);
  if (result.stage !== "ok" || !result.valid || !result.valid.nutrition) {
    throw new Error(`Expected normalized nutrition, got: ${JSON.stringify(result)}`);
  }
  if (result.valid.nutrition.kcal_per_serving !== 320 || result.valid.nutrition.protein_g_per_serving !== 25 || result.valid.nutrition.fat_g_per_serving !== 12 || result.valid.nutrition.carbs_g_per_serving !== 28) {
    throw new Error(`Unexpected nutrition after normalization: ${JSON.stringify(result.valid.nutrition)}`);
  }
});

Deno.test("recipeSchema: nutrition с plural-ключами proteins/fats сохраняется", () => {
  resetLastRecipeValidationState();
  const result = validateRecipe(`{
    "title": "Овощное рагу",
    "description": "Мягкое рагу с насыщенным вкусом.",
    "ingredients": [
      {"name": "Кабачок", "amount": "120 г"},
      {"name": "Морковь", "amount": "80 г"},
      {"name": "Сметана", "amount": "30 г"}
    ],
    "steps": ["Нарежьте овощи.", "Потушите до мягкости.", "Добавьте сметану в конце."],
    "cookingTimeMinutes": 25,
    "mealType": "lunch",
    "servings": 1,
    "chefAdvice": "Добавляйте сметану уже вне сильного кипения.",
    "nutrition": {
      "kcal": "145",
      "proteins": "6.5",
      "fats": "7,2 г",
      "carbohydrates": "14.1"
    }
  }`, parseAndValidateRecipeJsonFromString);
  if (result.stage !== "ok" || !result.valid || !result.valid.nutrition) {
    throw new Error(`Expected normalized nutrition with plural keys, got: ${JSON.stringify(result)}`);
  }
  if (result.valid.nutrition.protein_g_per_serving !== 6.5 || result.valid.nutrition.fat_g_per_serving !== 7.2 || result.valid.nutrition.carbs_g_per_serving !== 14.1) {
    throw new Error(`Unexpected plural-key nutrition normalization: ${JSON.stringify(result.valid.nutrition)}`);
  }
});

Deno.test("recipeSchema: неизвестный mealType идёт в fail_fast path", () => {
  resetLastRecipeValidationState();
  const result = validateRecipe(buildRecipeJson("бранч"), parseAndValidateRecipeJsonFromString);
  const diagnostics = getLastRecipeParseDiagnostics();
  const decision = decideRecipeRecovery(result.stage, diagnostics);
  if (result.stage !== "validate") {
    throw new Error(`Expected validate stage for unsupported mealType, got: ${JSON.stringify(result)}`);
  }
  if (!diagnostics.validationDetails.some((d) => String(d.path[0] ?? "") === "mealType")) {
    throw new Error(`Expected mealType validation details, got: ${JSON.stringify(diagnostics)}`);
  }
  if (decision.strategy !== "fail_fast") {
    throw new Error(`Expected fail_fast for unsupported mealType, got: ${JSON.stringify(decision)}`);
  }
});
