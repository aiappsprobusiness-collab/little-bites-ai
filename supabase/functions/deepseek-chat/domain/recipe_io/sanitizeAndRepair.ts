/**
 * Санитизация и ремонт рецепта: описание, советы шефа, минимальный fallback.
 * Поведение совместимо с текущим index.
 */

import type { RecipeJson } from "../../recipeSchema.ts";

const DESCRIPTION_INCOMPLETE_SUFFIXES = [/\sи\s*$/i, /\sили\s*$/i, /\sа также\s*$/i, /[—:]\s*$/];

export function isDescriptionIncomplete(desc: string | null | undefined): boolean {
  if (!desc || typeof desc !== "string") return false;
  const t = desc.trim();
  if (t.length < 20) return true;
  if (/\.\.\.\s*$/.test(t)) return true;
  if (DESCRIPTION_INCOMPLETE_SUFFIXES.some((re) => re.test(t))) return true;
  return false;
}

/** Один короткий вызов LLM для исправления только description. */
export async function repairDescriptionOnly(current: string, apiKey: string): Promise<string | null> {
  const sys = "Ты исправляешь только поле description. Верни ТОЛЬКО валидный JSON: {\"description\": \"...\"}. 2–4 полных предложения, без обрыва, без троеточий.";
  const user = `Текущее описание (обрывается): «${current.slice(0, 300)}». Допиши до 2–4 законченных предложений.`;
  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        max_tokens: 256,
        temperature: 0.3,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    const match = raw.match(/\{\s*"description"\s*:\s*"([^"]*(?:\\.[^"]*)*)"\s*\}/) || raw.match(/"description"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
    if (match && match[1]) {
      return match[1].replace(/\\"/g, '"').slice(0, 500);
    }
    return null;
  } catch {
    return null;
  }
}

const FORBIDDEN_PATTERNS = [
  /your child/gi,
  /your baby/gi,
  /your toddler/gi,
  /for your child/gi,
  /for your baby/gi,
  /for this child/gi,
  /\d+\s*(month|months|year|years)\s*(old)?/gi,
  /toddler/gi,
  /baby/gi,
  /\bchild\b/gi,
  /for children/gi,
  /для ребёнка/gi,
  /для ребенка/gi,
  /для малыша/gi,
  /для детей/gi,
  /\d+\s*(мес|месяц|месяцев|год|года|лет)\s*(\.|,|$)/gi,
  /с аллергией\s+на/gi,
  /аллергией на/gi,
  /готовится без[^.!?]*[.!?]?/gi,
  /приготовлено без[^.!?]*[.!?]?/gi,
  /,?\s*без\s+[а-яё]+\s+и\s+[а-яё]+[^.!?]*[.!?]?/gi,
];

export function sanitizeRecipeText(text: string | null | undefined): string {
  if (text == null || typeof text !== "string") return text ?? "";
  let result = text;
  for (const pattern of FORBIDDEN_PATTERNS) {
    result = result.replace(pattern, " ");
  }
  return result.replace(/\s+/g, " ").trim();
}

const MEAL_MENTION_PATTERNS = [
  /breakfast/gi,
  /lunch/gi,
  /dinner/gi,
  /snack/gi,
  /morning/gi,
  /evening/gi,
  /на завтрак/gi,
  /на обед/gi,
  /на ужин/gi,
  /на перекус/gi,
  /для завтрака/gi,
  /для перекуса/gi,
  /для обеда/gi,
  /для ужина/gi,
];

export function sanitizeMealMentions(text: string | null | undefined): string {
  if (text == null || typeof text !== "string") return text ?? "";
  let result = text;
  for (const pattern of MEAL_MENTION_PATTERNS) {
    result = result.replace(pattern, " ");
  }
  return result.replace(/\s+/g, " ").trim();
}

export function getMinimalRecipe(mealType: string): RecipeJson {
  const mt = ["breakfast", "lunch", "snack", "dinner"].includes(mealType) ? mealType : "snack";
  return {
    title: "Простой рецепт",
    description: "Быстрый вариант. Попробуйте запрос ещё раз для полного рецепта.",
    ingredients: [
      { name: "Ингредиент 1", amount: "100 г", displayText: "Ингредиент 1 — 100 г", canonical: { amount: 100, unit: "g" } },
      { name: "Ингредиент 2", amount: "2 шт.", displayText: "Ингредиент 2 — 2 шт.", canonical: { amount: 2, unit: "g" } },
      { name: "Ингредиент 3", amount: "1 ст.л.", displayText: "Ингредиент 3 — 1 ст.л.", canonical: { amount: 1, unit: "ml" } },
    ],
    steps: ["Подготовьте ингредиенты.", "Смешайте и готовьте по инструкции.", "Подавайте."],
    cookingTimeMinutes: 15,
    mealType: mt as "breakfast" | "lunch" | "snack" | "dinner",
    servings: 1,
    chefAdvice: null,
  };
}
