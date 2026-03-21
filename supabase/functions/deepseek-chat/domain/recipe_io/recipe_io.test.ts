/**
 * Контрактные тесты: парсинг/валидация рецепта, санитизация, enforce description/chefAdvice, минимальный fallback.
 * Запуск: из supabase/functions: deno test deepseek-chat/domain/recipe_io/recipe_io.test.ts --allow-read
 */
import { validateRecipe } from "./index.ts";
import { parseAndValidateRecipeJsonFromString, decideRecipeRecovery } from "../../recipeSchema.ts";
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
  pickCanonicalDescription,
  passesDescriptionQualityGate,
  passesChefAdviceQualityGate,
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

Deno.test("enforceDescription: результат всегда <= DESCRIPTION_MAX_LENGTH (210)", () => {
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

Deno.test("enforceChefAdvice: длинный конкретный совет укладывается в лимит или null", () => {
  const pad = "Держите 12 минут при 190°C, затем 5 минут при 170°C на решётке. ";
  const long = pad.repeat(10) + "Курицу посолите за час до запекания.";
  const out = enforceChefAdvice(long, {
    title: "Курица в духовке",
    ingredients: ["Курица"],
    steps: ["Запекайте."],
  });
  if (out != null && out.length > CHEF_ADVICE_MAX_LENGTH) {
    throw new Error(`Expected length <= ${CHEF_ADVICE_MAX_LENGTH} when non-null, got ${out.length}`);
  }
});

Deno.test("hasForbiddenChefAdviceStart: пафосные зачины ловятся", () => {
  if (!hasForbiddenChefAdviceStart("Для максимальной нежности не перегревайте.")) {
    throw new Error("Expected 'Для максимальной' forbidden start");
  }
  if (!hasForbiddenChefAdviceStart("Совет: добавьте соль.")) {
    throw new Error("Expected 'Совет:' forbidden start");
  }
  const nullAdvice = enforceChefAdvice("Для максимальной нежности подавайте тёплым.", {
    title: "Суп",
    ingredients: ["Вода"],
    steps: ["Варите."],
  });
  if (nullAdvice != null) {
    throw new Error(`Expected null when forbidden start, got: ${nullAdvice}`);
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

Deno.test("enforceChefAdvice: «Вкус насыщенного вкуса» → null", () => {
  const broken = "Вкус насыщенного вкуса добавьте немного чеснока перед запеканием.";
  const out = enforceChefAdvice(broken, { title: "Курица", ingredients: ["Курица"], steps: ["Запекайте."] });
  if (out != null) {
    throw new Error(`Expected null for broken stamp phrase, got: ${out}`);
  }
});

Deno.test("enforceChefAdvice: слабый совет → null; buildChefAdviceFallback ≤ лимит (legacy)", () => {
  const weak = enforceChefAdvice("Подавайте горячим и сразу к столу.", {
    title: "Суп",
    ingredients: ["Вода"],
    steps: ["Варите суп."],
  });
  if (weak != null) {
    throw new Error(`Expected null for generic serving advice, got: ${weak}`);
  }
  const fb = buildChefAdviceFallback({ title: "Каша", recipeIdSeed: "c" });
  if (fb.length > CHEF_ADVICE_MAX_LENGTH) {
    throw new Error(`Fallback must be <= ${CHEF_ADVICE_MAX_LENGTH}, got ${fb.length}`);
  }
});

Deno.test("enforceChefAdvice: «ты»-обращение переписывается на «Вы»", () => {
  const withTy = "Если ты хочешь корочку, запекай первые 15 минут при 210°C.";
  const out = enforceChefAdvice(withTy, {
    title: "Курица",
    ingredients: ["Курица"],
    steps: ["Разогрейте духовку."],
  });
  if (out == null) {
    throw new Error("Expected non-null after ty rewrite for concrete advice");
  }
  if (/\b(ты|тебе|твой|твоя|твоё|твоим|твоей)\b/i.test(out)) {
    throw new Error(`chefAdvice must not contain ты/тебе/твой after rewrite, got: ${out}`);
  }
  if (out.length > CHEF_ADVICE_MAX_LENGTH) {
    throw new Error(`chefAdvice must be <= ${CHEF_ADVICE_MAX_LENGTH}, got ${out.length}`);
  }
});

Deno.test("sanitizeChefAdviceForPool: БКМ/аллергии/детей/семью/ты → пустая строка", () => {
  const forbidden = [
    "Учитывая аллергию на БКМ, запекайте при 180°C.",
    "Подойдёт для детей и семьи. Общий стол.",
    "Если ты хочешь корочку, запекай при 210.",
  ];
  for (const raw of forbidden) {
    const out = sanitizeChefAdviceForPool(raw);
    if (out.length > 0) {
      throw new Error(`sanitizeChefAdviceForPool must return empty when unsafe, got: ${out}`);
    }
  }
});

Deno.test("enforceChefAdvice: конкретный совет заканчивается на .!?…", () => {
  const out = enforceChefAdvice("Запекайте курицу первые 15 минут при 200°C, затем убавьте до 170°C.", {
    title: "Курица",
    ingredients: ["Курица"],
    steps: ["Запекайте в духовке."],
  });
  if (out == null || !/[.!?…]\s*$/.test(out)) {
    throw new Error(`Expected non-null ending with punctuation, got: ${out}`);
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

Deno.test("enforceChefAdvice: «Для максимальной сочности» / «это позволит» → null", () => {
  const bad = "Для максимальной сочности запекайте при 200°C. Это позволит сохранить сок.";
  const out = enforceChefAdvice(bad, { title: "Курица", ingredients: ["Курица"], steps: ["Запекайте."] });
  if (out != null) {
    throw new Error(`Expected null, got: ${out}`);
  }
});

Deno.test("pickCanonicalDescription: хороший LLM → source llm, тот же текст что пойдёт в БД и в чат", () => {
  const fallback = "Детерминированный benefit для БД.";
  const llm =
    "Мягкие котлеты с травами хорошо держат форму на сковороде. Белок индейки и клетчатка овощей дают сытость без тяжести.";
  const pick = pickCanonicalDescription({
    sanitizedLlmDescription: llm,
    title: "Котлеты из индейки с кабачком",
    deterministicFallback: fallback,
  });
  if (pick.source !== "llm" || pick.rejectionReason != null) {
    throw new Error(`Expected llm, got ${pick.source} ${pick.rejectionReason}`);
  }
  if (pick.description !== llm) {
    throw new Error(`Expected LLM text preserved, got: ${pick.description}`);
  }
});

Deno.test("pickCanonicalDescription: штамп «отличный вариант» → deterministic_fallback", () => {
  const fallback = "Канон для БД.";
  const llm =
    "Отличный вариант на ужин. Белок и клетчатка поддерживают сытость и энергию.";
  const pick = pickCanonicalDescription({
    sanitizedLlmDescription: llm,
    title: "Рагу",
    deterministicFallback: fallback,
  });
  if (pick.source !== "deterministic_fallback" || pick.description !== fallback) {
    throw new Error(`Expected fallback, got: ${JSON.stringify(pick)}`);
  }
});

Deno.test("pickCanonicalDescription: утечка «в дорогу» → deterministic_fallback", () => {
  const fallback = "Канон для БД.";
  const llm =
    "Удобно сложить в контейнер в дорогу. Белок и медленные углеводы дадут энергию.";
  const pick = pickCanonicalDescription({
    sanitizedLlmDescription: llm,
    title: "Сэндвич",
    deterministicFallback: fallback,
  });
  if (pick.source !== "deterministic_fallback" || pick.rejectionReason !== "request_context_leak") {
    throw new Error(`Expected leak rejection, got: ${JSON.stringify(pick)}`);
  }
});

Deno.test("passesDescriptionQualityGate: одно предложение с маркером допускается", () => {
  const one =
    "Густой борщ с говядиной согревает и сытит: белок мяса и клетчатка овощей поддерживают энергию на несколько часов.";
  if (!passesDescriptionQualityGate(one, { title: "Борщ с говядиной" })) {
    throw new Error("Expected single-sentence description to pass gate");
  }
});

Deno.test("decideRecipeRecovery: при stage ok стратегия none — плохой chef_advice не требует второго полного LLM", () => {
  const d = decideRecipeRecovery("ok", null);
  if (d.strategy !== "none") {
    throw new Error(`Expected strategy none for ok stage, got ${d.strategy}`);
  }
});

Deno.test("passesChefAdviceQualityGate: конкретный совет проходит", () => {
  const ok = passesChefAdviceQualityGate(
    "Кабачок отожмите перед смешиванием с фаршем — масса не будет расползаться на сковороде.",
    {
      title: "Котлеты из кабачка",
      ingredients: ["Кабачок", "Фарш", "Лук"],
      steps: ["Натрите кабачок.", "Смешайте с фаршем.", "Обжарьте."],
    },
  );
  if (!ok) throw new Error("Expected chef advice gate pass");
});

Deno.test("passesChefAdviceQualityGate: только «Подавайте горячим.» не проходит", () => {
  const ok = passesChefAdviceQualityGate("Подавайте горячим.", {
    title: "Суп",
    ingredients: ["Вода", "Картофель", "Морковь"],
    steps: ["Нарежьте овощи.", "Варите до готовности.", "Посолите."],
  });
  if (ok) throw new Error("Expected chef advice gate reject");
});

Deno.test("pickCanonicalDescription: одна строка для JSON ответа и для payload description (нет split чат/БД)", () => {
  const fallback = "Benefit fallback для RPC.";
  const llm =
    "Нежные котлеты с травами держат форму на сковороде. Белок индейки и клетчатка овощей дают сытость без тяжести.";
  const pick = pickCanonicalDescription({
    sanitizedLlmDescription: llm,
    title: "Котлеты из индейки с кабачком",
    deterministicFallback: fallback,
  });
  const asInMessageJson = pick.description;
  const asInRpcPayload = pick.description;
  if (asInMessageJson !== asInRpcPayload) {
    throw new Error("Chat and DB description paths must use the same final string");
  }
});
