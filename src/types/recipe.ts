/**
 * Элемент списка ингредиентов с опциональными количеством и единицей.
 * Используется для отображения в UI и в опциональном поле ingredients_items рецепта.
 */
export interface IngredientItem {
  name: string;
  amount?: number;
  unit?: string;
  note?: string;
}

/**
 * Минимальный тип рецепта для отображения на экране рецепта.
 * ingredients — существующее поле (string[] или массив объектов из БД), не удалять.
 * ingredients_items — опциональное поле для списка с количествами; при наличии и непустом используется в UI.
 */
export interface RecipeDisplayIngredients {
  /** Существующий список (строки или объекты из recipe_ingredients). */
  ingredients?: string[] | Array<{ name?: string; amount?: number | null; unit?: string | null; note?: string }>;
  /** Опциональный список с количествами; при наличии приоритетен для отображения. */
  ingredients_items?: IngredientItem[];
}
