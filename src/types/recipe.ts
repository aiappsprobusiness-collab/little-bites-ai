import { formatIngredientMeasurement } from "@shared/ingredientMeasurementDisplay";

/** canonical_unit: только g/ml для будущего списка покупок. */
export type IngredientCanonicalUnit = "g" | "ml";

/**
 * Элемент списка ингредиентов.
 * display_text — fallback; при dual измерении строка строится через formatIngredientMeasurement.
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

/**
 * Текст ингредиента для UI (чип): structured dual / canonical / display_text fallback.
 */
export function ingredientDisplayLabel(ing: IngredientItem | Record<string, unknown>): string {
  return formatIngredientMeasurement(ing as Parameters<typeof formatIngredientMeasurement>[0], {
    servingMultiplier: 1,
  });
}

/**
 * Масштабирует отображение ингредиента по множителю порций (только canonical + dual display_amount).
 */
export function scaleIngredientDisplay(
  ing: IngredientItem | Record<string, unknown>,
  multiplier: number,
): string {
  return formatIngredientMeasurement(ing as Parameters<typeof formatIngredientMeasurement>[0], {
    servingMultiplier: multiplier,
  });
}
