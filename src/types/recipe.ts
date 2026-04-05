import type { IngredientMeasurementInput } from "@shared/ingredientMeasurementDisplay";
import { formatIngredientForUI } from "@shared/formatIngredientForUI";

/** canonical_unit: только g/ml для будущего списка покупок. */
export type IngredientCanonicalUnit = "g" | "ml";

/**
 * Элемент списка ингредиентов.
 * display_text — fallback; для карточки dual показывается только канон (г/мл), для списка покупок — см. formatIngredientForUI(..., 'shopping').
 * canonical_amount/unit — source of truth для порций и списка покупок.
 */
export interface IngredientItem {
  name: string;
  display_text?: string | null;
  canonical_name?: string | null;
  canonical_amount?: number | null;
  canonical_unit?: IngredientCanonicalUnit | null;
  amount?: number;
  unit?: string;
  note?: string;
  substitute?: string | null;
  display_amount?: number | null;
  display_unit?: string | null;
  display_quantity_text?: string | null;
  measurement_mode?: string | null;
}

/**
 * Минимальный тип рецепта для отображения на экране рецепта.
 * ingredients — существующее поле (string[] или массив объектов из БД), не удалять.
 * ingredients_items — опциональное поле для списка с количествами; при наличии и непустом используется в UI.
 */
export interface RecipeDisplayIngredients {
  /** Существующий список (строки или объекты из recipe_ingredients). */
  ingredients?: string[] | Array<{
    name?: string;
    display_text?: string | null;
    canonical_amount?: number | null;
    canonical_unit?: string | null;
    amount?: number | null;
    unit?: string | null;
    note?: string;
    display_amount?: number | null;
    display_unit?: string | null;
    display_quantity_text?: string | null;
    measurement_mode?: string | null;
    category?: string | null;
  }>;
  /** Опциональный список с количествами; при наличии приоритетен для отображения. */
  ingredients_items?: IngredientItem[];
}

function formatRecipeIngredientDisplayLine(
  ing: IngredientMeasurementInput,
  options?: { servingMultiplier?: number },
): string {
  const name = (ing.name ?? "").trim();
  const note = typeof ing.note === "string" ? ing.note.trim() : "";
  if (note) return name ? `${name} — ${note}` : note;

  const dt = (ing.display_text ?? "").trim();
  if (/по вкусу|для подачи/i.test(dt)) {
    return name ? (dt.includes("—") ? dt : `${name} — ${dt}`) : dt;
  }

  const q = formatIngredientForUI(ing, "recipe", options);
  if (q.includes(" — ")) return q;
  return name ? `${name} — ${q}` : q;
}

/**
 * Полная строка ингредиента для чипа / шаринга / чата: «Название — количество».
 */
export function ingredientDisplayLabel(ing: IngredientItem | Record<string, unknown>): string {
  return formatRecipeIngredientDisplayLine(ing as IngredientMeasurementInput, { servingMultiplier: 1 });
}

/**
 * То же с масштабом порций (только canonical + dual display_amount внутри formatIngredientForUI для recipe).
 */
export function scaleIngredientDisplay(ing: IngredientItem | Record<string, unknown>, multiplier: number): string {
  return formatRecipeIngredientDisplayLine(ing as IngredientMeasurementInput, { servingMultiplier: multiplier });
}
