/** canonical_unit: только g/ml для будущего списка покупок. */
export type IngredientCanonicalUnit = "g" | "ml";

/**
 * Элемент списка ингредиентов.
 * display_text — как показывать в UI ("1 яблоко", "2 яйца").
 * canonical_amount/unit — для списка покупок (г/мл), опционально.
 */
export interface IngredientItem {
  name: string;
  /** Готовый текст для UI. Приоритет над name+amount+unit. */
  display_text?: string | null;
  /** Количество в канонических единицах (г/мл) для списка покупок. */
  canonical_amount?: number | null;
  canonical_unit?: IngredientCanonicalUnit | null;
  amount?: number;
  unit?: string;
  note?: string;
  /** Варианты замены (из recipe_ingredients.substitute или локальный словарь). */
  substitute?: string | null;
}

/**
 * Минимальный тип рецепта для отображения на экране рецепта.
 * ingredients — существующее поле (string[] или массив объектов из БД), не удалять.
 * ingredients_items — опциональное поле для списка с количествами; при наличии и непустом используется в UI.
 */
export interface RecipeDisplayIngredients {
  /** Существующий список (строки или объекты из recipe_ingredients). */
  ingredients?: string[] | Array<{ name?: string; display_text?: string | null; canonical_amount?: number | null; canonical_unit?: string | null; amount?: number | null; unit?: string | null; note?: string }>;
  /** Опциональный список с количествами; при наличии приоритетен для отображения. */
  ingredients_items?: IngredientItem[];
}

/** Текст ингредиента для UI: name + display_text (количество), либо name + amount/unit/note. */
export function ingredientDisplayLabel(ing: IngredientItem | { name?: string; display_text?: string | null; amount?: number | null; unit?: string | null; note?: string }): string {
  const name = ing.name ?? "";
  const dt = (ing as { display_text?: string | null }).display_text;
  if (typeof dt === "string" && dt.trim()) {
    // Если display_text уже содержит name (legacy) — не дублировать
    if (name && dt.toLowerCase().includes(name.toLowerCase().trim())) return dt.trim();
    return name ? `${name} — ${dt.trim()}` : dt.trim();
  }
  const note = (ing as { note?: string }).note;
  if (note) return name ? `${name} — ${note}` : note;
  const amt = (ing as { amount?: number | null }).amount;
  const unit = (ing as { unit?: string | null }).unit;
  if (amt != null && unit) return `${name} — ${amt} ${unit}`.trim();
  if (amt != null) return `${name} — ${amt}`.trim();
  return name;
}
