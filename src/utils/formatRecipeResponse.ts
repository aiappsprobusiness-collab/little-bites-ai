/**
 * Форматирование ответа DeepSeek с рецептом (JSON) в текст по шаблону с эмодзи.
 * Для общих рецептов и ответов с рецептами: обязательно форматированный текст + эмодзи.
 */

import { getIngredientEmoji } from './ingredientEmojis';

interface RecipeLike {
  title?: string;
  name?: string;
  description?: string;
  ingredients?: string[];
  steps?: string[];
  cookingTime?: number;
  cooking_time?: number;
}

function extractRecipeJson(raw: string): { single?: RecipeLike; multi?: RecipeLike[] } | null {
  let jsonString: string | null = null;
  const codeBlock = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlock?.[1]) jsonString = codeBlock[1];
  else {
    const simple = raw.match(/\{[\s\S]*\}/);
    if (simple) jsonString = simple[0];
  }
  if (!jsonString) return null;

  try {
    const parsed = JSON.parse(jsonString);
    if (parsed.title || parsed.name) {
      return { single: parsed };
    }
    const list = Array.isArray(parsed) ? parsed : parsed.recipes;
    if (Array.isArray(list) && list.length > 0) {
      return { multi: list };
    }
  } catch {
    return null;
  }
  return null;
}

function formatOne(recipe: RecipeLike): string {
  const title = (recipe.title || recipe.name || '').trim();
  if (!title) return '';

  let out = `🍽️ **${title}**\n\n`;
  if (recipe.description) out += `${recipe.description}\n\n`;

  const time = recipe.cookingTime ?? recipe.cooking_time;
  if (time != null) out += `⏱️ Время приготовления: ${time} мин\n\n`;

  const ings = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  if (ings.length > 0) {
    out += `🥘 **Ингредиенты:**\n`;
    ings.forEach((ing, i) => {
      const emoji = getIngredientEmoji(ing);
      out += `${i + 1}. ${emoji} ${ing}\n`;
    });
    out += '\n';
  }

  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  if (steps.length > 0) {
    out += `👨‍🍳 **Приготовление:**\n`;
    steps.forEach((step, i) => {
      out += `${i + 1}. ${step}\n`;
    });
  }

  return out;
}

/**
 * Если в ответе есть JSON рецепт(ы), возвращает форматированный текст по шаблону с эмодзи.
 * Иначе возвращает исходную строку.
 */
export function formatRecipeResponse(aiResponse: string): string {
  const extracted = extractRecipeJson(aiResponse);
  if (!extracted) return aiResponse;

  if (extracted.single) {
    return formatOne(extracted.single).trim();
  }
  if (extracted.multi && extracted.multi.length > 0) {
    return extracted.multi.map((r) => formatOne(r)).join('\n---\n\n').trim();
  }

  return aiResponse;
}

/**
 * Проверяет, содержит ли ответ JSON рецепт(ов).
 */
export function hasRecipeJson(aiResponse: string): boolean {
  return extractRecipeJson(aiResponse) != null;
}
