/**
 * Формирование plain-text рецепта для шаринга (Telegram, WhatsApp и т.д.).
 * Один текстовый блок, без markdown; переносы строк — '\n'.
 */

import type { IngredientItem } from "@/types/recipe";
import { ingredientDisplayLabel } from "@/types/recipe";

const APP_URL = "https://momrecipes.online";
const SIGNATURE_LINE = "Рецепт сгенерирован приложением momrecipes.online";

export interface ShareRecipeInput {
  title: string;
  /** Блок "Почему это полезно" (description). */
  description?: string | null;
  cooking_time_minutes?: number | null;
  recipeId: string;
  /** Уже нормализованный список для отображения (как в UI). */
  ingredients: IngredientItem[];
}

/**
 * Собирает один текстовый блок рецепта для шаринга.
 * Пустые блоки (нет полезности, нет времени) пропускаются без заголовка.
 * Внизу всегда подпись + URL приложения.
 */
export function buildRecipeShareText(params: ShareRecipeInput): string {
  const { title, description, cooking_time_minutes, recipeId, ingredients } = params;
  const lines: string[] = [];

  lines.push(title.trim() || "Рецепт");

  if (description != null && String(description).trim() !== "") {
    lines.push("");
    lines.push(String(description).trim());
  }

  if (ingredients.length > 0) {
    lines.push("");
    for (const ing of ingredients) {
      const label = ingredientDisplayLabel(ing);
      if (label) lines.push(`• ${label}`);
    }
  }

  if (cooking_time_minutes != null && Number(cooking_time_minutes) > 0) {
    lines.push("");
    lines.push(`Время приготовления: ${cooking_time_minutes} мин`);
  }

  const origin = typeof window !== "undefined" ? window.location.origin : APP_URL;
  const recipeUrl = `${origin}/recipe/${recipeId}`;
  lines.push("");
  lines.push(recipeUrl);

  lines.push("");
  lines.push(SIGNATURE_LINE);
  lines.push(APP_URL);

  return lines.join("\n");
}

/** Подпись внизу текста шаринга (для тестов). */
export function getShareSignature(): { line: string; url: string } {
  return { line: SIGNATURE_LINE, url: APP_URL };
}
