/**
 * Формирование plain-text рецепта для шаринга (Telegram, WhatsApp и т.д.).
 * Один текстовый блок «карточка рецепта», без markdown; переносы строк — '\n'.
 */

import type { IngredientItem } from "@/types/recipe";
import { ingredientDisplayLabel } from "@/types/recipe";

/** Базовый URL приложения для ссылок в шаринге (рецепт, подпись). Без localhost — всегда прод. */
const BASE_URL = "https://momrecipes.online";

/** URL приложения в подписи шаринга (отдельная константа на случай смены домена). */
export const SHARE_APP_URL = BASE_URL;
/** Строка подписи внизу шаринга (без эмодзи; ссылка — на следующей строке). */
const SHARE_SIGNATURE_LINE = "— Рецепт из приложения Mom Recipes";
const PREP_FALLBACK = "следуйте привычной технологии для этого блюда (в приложении откройте полную версию рецепта).";

const MEAL_EMOJI: Record<string, string> = {
  breakfast: "🥣",
  lunch: "🍲",
  dinner: "🥗",
  snack: "🍪",
};
const MEAL_LABEL: Record<string, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

export type MealTypeKey = "breakfast" | "lunch" | "dinner" | "snack";

export interface ShareRecipeInput {
  title: string;
  /** Блок "Почему это полезно" (description). */
  description?: string | null;
  cooking_time_minutes?: number | null;
  recipeId: string;
  /** Уже нормализованный список для отображения (как в UI). */
  ingredients: IngredientItem[];
  /** Шаги приготовления (instruction, step_number). Если один текст — разбить на пункты. */
  steps?: Array<{ instruction?: string; step_number?: number }> | null;
  /** Совет от шефа (chef_advice / chefAdvice). */
  chefAdvice?: string | null;
  /** Тип приёма пищи: для строки 🥣 Завтрак / 🍲 Обед и т.д. Может быть уже локализованная строка (mealTypeLabel) или ключ. */
  mealTypeLabel?: string | null;
  meal_type?: MealTypeKey | string | null;
  /** URL для подписи (с ep/ch/sr для вирусности). Если не передан — используется BASE_URL. */
  shareUrl?: string | null;
}

function getMealLine(params: Pick<ShareRecipeInput, "mealTypeLabel" | "meal_type">): string | null {
  const { mealTypeLabel, meal_type } = params;
  if (mealTypeLabel != null && String(mealTypeLabel).trim() !== "") {
    const key = meal_type != null && typeof meal_type === "string" ? meal_type.toLowerCase() : null;
    const emoji = key && MEAL_EMOJI[key] ? MEAL_EMOJI[key] : "🍽️";
    return `${emoji} ${String(mealTypeLabel).trim()}`;
  }
  if (meal_type != null && typeof meal_type === "string") {
    const key = meal_type.toLowerCase();
    const label = MEAL_LABEL[key] ?? meal_type;
    const emoji = MEAL_EMOJI[key] ?? "🍽️";
    return `${emoji} ${label}`;
  }
  return null;
}

/** Разбить один текст на пункты по переносам или по точкам. */
function splitInstructionsToSteps(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const byNewline = trimmed.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (byNewline.length > 1) return byNewline;
  const byDot = trimmed.split(/\.\s+/).map((s) => s.trim()).filter(Boolean);
  if (byDot.length > 1) return byDot.map((s) => (s.endsWith(".") ? s : `${s}.`));
  return [trimmed];
}

function formatPreparationSteps(steps: ShareRecipeInput["steps"]): string {
  if (Array.isArray(steps) && steps.length > 0) {
    const sorted = [...steps].sort(
      (a, b) => (a.step_number ?? 0) - (b.step_number ?? 0)
    );
    return sorted
      .map((s, i) => {
        const num = s.step_number ?? i + 1;
        const text = (s.instruction ?? "").trim();
        return text ? `${num}) ${text}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/**
 * Собирает один текстовый блок рецепта для шаринга в формате «карточки».
 * Порядок: заголовок → тип приёма → время → описание → ингредиенты → шаги → совет → подпись + ссылки.
 */
export function buildRecipeShareText(params: ShareRecipeInput): string {
  const {
    title,
    description,
    cooking_time_minutes,
    recipeId,
    ingredients,
    steps,
    chefAdvice,
    mealTypeLabel,
    meal_type,
    shareUrl,
  } = params;

  const lines: string[] = [];
  const blank = () => lines.push("");

  // 1) Заголовок
  lines.push(title.trim() || "Рецепт");

  // 2) Тип приёма пищи
  const mealLine = getMealLine({ mealTypeLabel, meal_type });
  if (mealLine) lines.push(mealLine);

  // 3) Время приготовления (сразу под типом приёма, без дублирования)
  if (cooking_time_minutes != null && Number(cooking_time_minutes) > 0) {
    lines.push(`⏱ ${cooking_time_minutes} мин`);
  }

  // 4) Описание / польза
  if (description != null && String(description).trim() !== "") {
    blank();
    lines.push("💚 Почему это полезно:");
    lines.push(String(description).trim());
  }

  // 5) Ингредиенты
  blank();
  lines.push("🧾 Ингредиенты:");
  if (ingredients.length > 0) {
    for (const ing of ingredients) {
      const label = ingredientDisplayLabel(ing);
      if (label) lines.push(`• ${label}`);
    }
  }

  // 6) Шаги приготовления
  blank();
  const stepsFormatted = formatPreparationSteps(steps);
  if (stepsFormatted) {
    lines.push("👩‍🍳 Приготовление:");
    lines.push(stepsFormatted);
  } else {
    lines.push("👩‍🍳 Приготовление: " + PREP_FALLBACK);
  }

  // 7) Совет от шефа
  if (chefAdvice != null && String(chefAdvice).trim() !== "") {
    blank();
    lines.push("👩‍🍳✨ Совет от шефа:");
    lines.push(String(chefAdvice).trim());
  }

  // 8) Подпись + ссылка (shareUrl с ep/ch/sr для аналитики вирусности)
  const body = lines.join("\n");
  const linkUrl = shareUrl && shareUrl.trim() ? shareUrl.trim() : BASE_URL;
  const footer = `${SHARE_SIGNATURE_LINE}\n${linkUrl}`;
  return `${body}\n\n${footer}`;
}

/** Подпись внизу текста шаринга (для тестов). */
export function getShareSignature(): { line: string; url: string } {
  return { line: SHARE_SIGNATURE_LINE, url: SHARE_APP_URL };
}
