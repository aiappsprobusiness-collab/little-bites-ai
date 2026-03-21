/**
 * Тесты сборки промпта: recipe-path V3 содержит RECIPE_SYSTEM_RULES_V3 и не содержит старые длинные блоки.
 * Запуск: из supabase/functions: deno test deepseek-chat/buildPrompt.test.ts --allow-read
 */
import { generateRecipeSystemPromptV3 } from "./buildPrompt.ts";
import {
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_QUALITY_MIN_LENGTH,
  DESCRIPTION_QUALITY_TWO_SENTENCE_MIN_LENGTH,
} from "./domain/recipe_io/sanitizeAndRepair.ts";
import { CHEF_ADVICE_RULES, RECIPE_SYSTEM_RULES_V3 } from "./prompts.ts";

Deno.test("generateRecipeSystemPromptV3: likes не в [CONTEXT] — только оркестратор (index) добавляет мягкий сигнал", () => {
  const prompt = generateRecipeSystemPromptV3(
    { name: "Test", age_months: 24, allergies: [], dislikes: [], likes: ["баранина", "рыба"] },
    false,
    false,
    [],
    { mealType: "lunch", servings: 2 }
  );
  if (prompt.includes("SOFT likes:") || prompt.includes("баранина")) {
    throw new Error("V3 must not inject likes into CONTEXT; got likes in prompt");
  }
});

Deno.test("generateRecipeSystemPromptV3: содержит RECIPE_SYSTEM_RULES_V3", () => {
  const prompt = generateRecipeSystemPromptV3(
    { name: "Test", age_months: 24, allergies: [], dislikes: [] },
    false,
    false,
    [],
    { mealType: "lunch", servings: 2 }
  );
  const v3Snippet = "Верни ровно 1 JSON-объект рецепта";
  if (!prompt.includes(v3Snippet)) {
    throw new Error(`Expected prompt to contain "${v3Snippet}", got: ${prompt.slice(0, 300)}...`);
  }
  if (!prompt.includes("mealType только")) {
    throw new Error("Expected V3 rules to contain mealType constraint");
  }
  if (!prompt.includes("breakfast|lunch|dinner|snack")) {
    throw new Error("Expected prompt to contain mealType enum");
  }
});

Deno.test("generateRecipeSystemPromptV3: НЕ содержит старые длинные блоки", () => {
  const prompt = generateRecipeSystemPromptV3(
    { name: "Test", age_months: 36 },
    true,
    false,
    [],
    {}
  );
  const oldMarkers = [
    "RECIPE_STRICT_JSON_CONTRACT",
    "ОПИСАНИЕ (поле \"description\")",
    "СОВЕТ ОТ ШЕФА (поле \"chefAdvice\")",
    "RECIPE_ONE_ONLY_RULE",
    "RULES_USER_INTENT",
    "Даже если запрос общий («гарнир к мясу»",
  ];
  for (const marker of oldMarkers) {
    if (prompt.includes(marker)) {
      throw new Error(`Recipe V3 prompt must NOT contain old block: "${marker}"`);
    }
  }
});

Deno.test("RECIPE_SYSTEM_RULES_V3: компактный блок (Stage B: без раздутого CHEF)", () => {
  const lines = RECIPE_SYSTEM_RULES_V3.trim().split("\n").filter((l) => l.trim().length > 0);
  if (lines.length > 22) {
    throw new Error(`RECIPE_SYSTEM_RULES_V3 should stay compact, got ${lines.length} non-empty lines`);
  }
  if (!RECIPE_SYSTEM_RULES_V3.includes("Верни ровно 1 JSON")) {
    throw new Error("RECIPE_SYSTEM_RULES_V3 must require single JSON object");
  }
});

Deno.test("CHEF_ADVICE_RULES: нет длинных good/bad примеров (quality gate в коде)", () => {
  if (CHEF_ADVICE_RULES.includes("ХОРОШИЕ ПРИМЕРЫ") || CHEF_ADVICE_RULES.includes("ПЛОХИЕ ПРИМЕРЫ")) {
    throw new Error("CHEF_ADVICE_RULES must not contain example blocks duplicated with chefAdviceQuality.ts");
  }
  const chefLines = CHEF_ADVICE_RULES.trim().split("\n").filter((l) => l.trim().length > 0);
  if (chefLines.length > 10) {
    throw new Error(`CHEF_ADVICE_RULES should be <= 10 non-empty lines, got ${chefLines.length}`);
  }
});

Deno.test("generateRecipeSystemPromptV3: лимиты description = константы passesDescriptionQualityGate", () => {
  const prompt = generateRecipeSystemPromptV3(
    { name: "Test", age_months: 24, allergies: [], dislikes: [] },
    false,
    false,
    [],
    { mealType: "lunch", servings: 2 },
  );
  for (const n of [
    String(DESCRIPTION_QUALITY_MIN_LENGTH),
    String(DESCRIPTION_MAX_LENGTH),
    String(DESCRIPTION_QUALITY_TWO_SENTENCE_MIN_LENGTH),
  ]) {
    if (!prompt.includes(n)) {
      throw new Error(`Expected recipe prompt to include gate number ${n} for description sync`);
    }
  }
});
