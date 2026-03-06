/**
 * Контрактные тесты: парсинг/валидация рецепта, санитизация, enforce description/chefAdvice, минимальный fallback.
 * Запуск: из supabase/functions: deno test deepseek-chat/domain/recipe_io/recipe_io.test.ts --allow-read
 */
import { validateRecipe } from "./index.ts";
import { parseAndValidateRecipeJsonFromString } from "../../recipeSchema.ts";
import {
  sanitizeRecipeText,
  sanitizeMealMentions,
  getMinimalRecipe,
  enforceDescription,
  enforceChefAdvice,
  buildDescriptionFallback,
  buildChefAdviceFallback,
  hasForbiddenChefAdviceStart,
  sanitizeDescriptionForPool,
  sanitizeChefAdviceForPool,
  DESCRIPTION_MAX_LENGTH,
  CHEF_ADVICE_MAX_LENGTH,
} from "./index.ts";

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

// --- enforceDescription / enforceChefAdvice (sanitize guarantees) ---

Deno.test("enforceDescription: результат всегда <= 170 символов", () => {
  const long = "Очень длинное описание блюда. ".repeat(20);
  const out = enforceDescription(long, { title: "Блюдо" });
  if (out.length > DESCRIPTION_MAX_LENGTH) {
    throw new Error(`Expected description length <= ${DESCRIPTION_MAX_LENGTH}, got ${out.length}`);
  }
  const normal = "Каша из риса. Нежная текстура.";
  const out2 = enforceDescription(normal);
  if (out2.length > DESCRIPTION_MAX_LENGTH) {
    throw new Error(`Expected description length <= ${DESCRIPTION_MAX_LENGTH}, got ${out2.length}`);
  }
});

Deno.test("enforceChefAdvice: результат всегда <= 280 символов", () => {
  const long = "Совет от шефа: повторяем много раз. ".repeat(15);
  const out = enforceChefAdvice(long, { title: "Суп", recipeIdSeed: "id1" });
  if (out.length > CHEF_ADVICE_MAX_LENGTH) {
    throw new Error(`Expected chefAdvice length <= ${CHEF_ADVICE_MAX_LENGTH}, got ${out.length}`);
  }
});

Deno.test("enforceChefAdvice: запрещённые старты заменяются", () => {
  if (!hasForbiddenChefAdviceStart("Подавайте горячим.")) {
    throw new Error("Expected 'Подавайте' to be detected as forbidden start");
  }
  if (!hasForbiddenChefAdviceStart("Можно украсить зеленью.")) {
    throw new Error("Expected 'Можно' to be detected as forbidden start");
  }
  const fixed = enforceChefAdvice("Подавайте горячим. Не перегревайте.", { title: "Суп", recipeIdSeed: "seed1" });
  if (hasForbiddenChefAdviceStart(fixed)) {
    throw new Error(`Enforced chefAdvice must not start with forbidden phrase, got: ${fixed.slice(0, 50)}`);
  }
  if (fixed.length > CHEF_ADVICE_MAX_LENGTH) {
    throw new Error(`Enforced chefAdvice must be <= ${CHEF_ADVICE_MAX_LENGTH}, got ${fixed.length}`);
  }
});

Deno.test("buildDescriptionFallback: детерминированность по recipeIdSeed", () => {
  const a = buildDescriptionFallback({ title: "Каша", keyIngredient: "рис", recipeIdSeed: "abc" });
  const b = buildDescriptionFallback({ title: "Каша", keyIngredient: "рис", recipeIdSeed: "abc" });
  if (a !== b) {
    throw new Error(`Same seed must give same fallback: ${a} vs ${b}`);
  }
  if (a.length > DESCRIPTION_MAX_LENGTH) {
    throw new Error(`Fallback description must be <= ${DESCRIPTION_MAX_LENGTH}, got ${a.length}`);
  }
});

Deno.test("buildChefAdviceFallback: детерминированность по recipeIdSeed", () => {
  const a = buildChefAdviceFallback({ title: "Суп", recipeIdSeed: "xyz" });
  const b = buildChefAdviceFallback({ title: "Суп", recipeIdSeed: "xyz" });
  if (a !== b) {
    throw new Error(`Same seed must give same chefAdvice fallback: ${a} vs ${b}`);
  }
  if (a.length > CHEF_ADVICE_MAX_LENGTH) {
    throw new Error(`Fallback chefAdvice must be <= ${CHEF_ADVICE_MAX_LENGTH}, got ${a.length}`);
  }
});

Deno.test("sanitize + enforce: запрещённые упоминания не появляются в итоге", () => {
  const withChild = "Для вашего ребёнка подойдёт. Идеально на завтрак.";
  const sanitized = sanitizeRecipeText(withChild);
  const mealSanitized = sanitizeMealMentions(sanitized);
  const desc = enforceDescription(mealSanitized, { title: "Блюдо" });
  if (/ребёнк|child|завтрак|breakfast/i.test(desc)) {
    throw new Error(`Forbidden mentions (age/meal) must not appear in final description: ${desc}`);
  }
});

Deno.test("enforceDescription: никогда не заканчивается на «в.» или «и.»", () => {
  const withBadEnd1 = "Нежная консистенция и приятный вкус. Хранить в.";
  const out1 = enforceDescription(withBadEnd1, { title: "Курица" });
  if (out1.endsWith(" в.") || out1.endsWith("в.")) {
    throw new Error(`Description must not end with 'в.': ${out1}`);
  }
  const withBadEnd2 = "Каша из риса. Сытная и.";
  const out2 = enforceDescription(withBadEnd2, { title: "Каша" });
  if (out2.endsWith(" и.") || out2.endsWith("и.")) {
    throw new Error(`Description must not end with 'и.': ${out2}`);
  }
});

Deno.test("enforceChefAdvice: «Вкус насыщенного вкуса» пересобирается в fallback", () => {
  const broken = "Вкус насыщенного вкуса добавьте немного чеснока перед запеканием.";
  const out = enforceChefAdvice(broken, { title: "Курица", recipeIdSeed: "s1" });
  if (/вкус\s+насыщенного\s+вкуса/i.test(out)) {
    throw new Error(`Broken phrase must be replaced, got: ${out}`);
  }
  if (out.length > CHEF_ADVICE_MAX_LENGTH) {
    throw new Error(`chefAdvice must be <= ${CHEF_ADVICE_MAX_LENGTH}, got ${out.length}`);
  }
  if (out.length < 20) {
    throw new Error(`Rebuilt chefAdvice must be non-empty, got: ${out}`);
  }
});

Deno.test("enforceChefAdvice: запрещённые старты и fallback укладываются в лимит", () => {
  const templates = [
    enforceChefAdvice("Подавайте горячим.", { title: "Суп", recipeIdSeed: "a" }),
    enforceChefAdvice("Можно украсить зеленью.", { title: "Салат", recipeIdSeed: "b" }),
    buildChefAdviceFallback({ title: "Каша", recipeIdSeed: "c" }),
  ];
  for (const t of templates) {
    if (t.length > CHEF_ADVICE_MAX_LENGTH) {
      throw new Error(`chefAdvice must be <= ${CHEF_ADVICE_MAX_LENGTH}, got ${t.length}: ${t.slice(0, 50)}`);
    }
    if (!/[.!?…]\s*$/.test(t)) {
      throw new Error(`chefAdvice must end with .!?…, got: ${t.slice(-20)}`);
    }
  }
});

Deno.test("enforceChefAdvice: «ты»-обращение переписывается на «Вы»", () => {
  const withTy = "Если ты хочешь корочку, запекай первые 15 минут при 210.";
  const out = enforceChefAdvice(withTy, { title: "Курица", recipeIdSeed: "s1" });
  if (/\b(ты|тебе|твой|твоя|твоё|твоим|твоей)\b/i.test(out)) {
    throw new Error(`chefAdvice must not contain ты/тебе/твой after rewrite, got: ${out}`);
  }
  if (out.length > CHEF_ADVICE_MAX_LENGTH) {
    throw new Error(`chefAdvice must be <= ${CHEF_ADVICE_MAX_LENGTH}, got ${out.length}`);
  }
});

Deno.test("sanitizeChefAdviceForPool: вычищает БКМ/аллергии/детей/семью/ты", () => {
  const forbidden = [
    "Учитывая аллергию на БКМ, запекайте при 180°C.",
    "Подойдёт для детей и семьи. Общий стол.",
    "Если ты хочешь корочку, запекай при 210.",
  ];
  for (const raw of forbidden) {
    const out = sanitizeChefAdviceForPool(raw, "seed1");
    if (/бкм|аллерг|детям|семь(я|и)|общ(ий|его)\s*стол/i.test(out)) {
      throw new Error(`sanitizeChefAdviceForPool must remove forbidden words, got: ${out}`);
    }
    if (/(^|[\s,.:;!?])(ты|тебе|твой|твоя|твоё)([\s,.:;!?]|$)/i.test(out)) {
      throw new Error(`sanitizeChefAdviceForPool must remove ты-обращение, got: ${out}`);
    }
  }
});

Deno.test("enforceChefAdvice: результат заканчивается на .!?…", () => {
  const cases = [
    enforceChefAdvice("Запекайте 15 минут при 200°C. Это даст корочку.", { recipeIdSeed: "a" }),
    enforceChefAdvice("Добавьте зелень в конце.", { recipeIdSeed: "b" }),
  ];
  for (const out of cases) {
    if (!/[.!?…]\s*$/.test(out)) {
      throw new Error(`chefAdvice must end with .!?…, got: ${out.slice(-20)}`);
    }
  }
});

Deno.test("sanitizeDescriptionForPool: при дубле title возвращает fallback без названия", () => {
  const title = "Рисовая каша";
  const descWithTitle = "Рисовая каша с молоком и маслом. Сытный завтрак.";
  const out = sanitizeDescriptionForPool(descWithTitle, title, "seed1");
  const titleKey = title.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ");
  if (out.toLowerCase().includes(titleKey)) {
    throw new Error(`sanitizeDescriptionForPool must not contain normalized title, got: ${out}`);
  }
  if (out.length > DESCRIPTION_MAX_LENGTH) {
    throw new Error(`description must be <= ${DESCRIPTION_MAX_LENGTH}, got ${out.length}`);
  }
});

Deno.test("enforceDescription: штамп «идеально подходит» заменяется на fallback", () => {
  const withStamp = "Это блюдо идеально подходит для всей семьи. Вкусно.";
  const out = enforceDescription(withStamp, { title: "Каша", recipeIdSeed: "x" });
  if (out.toLowerCase().includes("идеально подходит") || out.toLowerCase().includes("это блюдо")) {
    throw new Error(`Description with forbidden phrase must be replaced, got: ${out}`);
  }
  if (out.length > DESCRIPTION_MAX_LENGTH) {
    throw new Error(`description must be <= ${DESCRIPTION_MAX_LENGTH}, got ${out.length}`);
  }
});

Deno.test("enforceChefAdvice: «Для максимальной сочности» заменяется на fallback", () => {
  const bad = "Для максимальной сочности запекайте при 200°C. Это позволит сохранить сок.";
  const out = enforceChefAdvice(bad, { title: "Курица", recipeIdSeed: "y" });
  if (/для максимальной|это позволит/i.test(out)) {
    throw new Error(`Forbidden start must be replaced, got: ${out.slice(0, 80)}`);
  }
  if (out.length > CHEF_ADVICE_MAX_LENGTH) {
    throw new Error(`chefAdvice must be <= ${CHEF_ADVICE_MAX_LENGTH}, got ${out.length}`);
  }
});
