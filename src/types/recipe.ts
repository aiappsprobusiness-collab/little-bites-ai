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

/**
 * Текст ингредиента для UI (чип): безопасный fallback при кривых данных.
 * Приоритет: display_text → name + amount + unit → name → "Ингредиент".
 */
export function ingredientDisplayLabel(ing: IngredientItem | { name?: string; display_text?: string | null; amount?: number | null; unit?: string | null; note?: string }): string {
  const name = (ing.name ?? "").trim();
  const dt = (ing as { display_text?: string | null }).display_text;
  if (typeof dt === "string" && dt.trim().length >= 1) {
    const trimmed = dt.trim();
    if (trimmed.length < 3) {
      /* fallback to name + amount + unit if display_text too short */
    } else {
      if (name && trimmed.toLowerCase().includes(name.toLowerCase())) return trimmed;
      return name ? `${name} — ${trimmed}` : trimmed;
    }
  }
  const note = (ing as { note?: string }).note;
  if (typeof note === "string" && note.trim()) return name ? `${name} — ${note.trim()}` : note.trim();
  const amt = (ing as { amount?: number | null }).amount;
  const unit = (ing as { unit?: string | null }).unit;
  const part = [name, amt != null ? String(amt) : "", unit ?? ""].join(" ").trim();
  if (part) return part;
  return name || "Ингредиент";
}

/**
 * Масштабирует отображение ингредиента по множителю порций.
 * amountScaled = amount * multiplier, canonical_amountScaled = canonical_amount * multiplier.
 * Не масштабирует качественные подписи (по вкусу, для подачи).
 */
export function scaleIngredientDisplay(
  ing: IngredientItem | { name?: string; display_text?: string | null; canonical_amount?: number | null; canonical_unit?: string | null; amount?: number | null; unit?: string | null },
  multiplier: number
): string {
  if (multiplier <= 0 || !Number.isFinite(multiplier)) return ingredientDisplayLabel(ing as IngredientItem);
  const dt = (ing as { display_text?: string | null }).display_text ?? "";
  if (typeof dt === "string" && (/по вкусу|для подачи/i.test(dt.trim()))) return ingredientDisplayLabel(ing as IngredientItem);
  const name = ((ing as { name?: string }).name ?? "").trim();
  const canonical_amount = (ing as { canonical_amount?: number | null }).canonical_amount;
  const canonical_unit = (ing as { canonical_unit?: string | null }).canonical_unit;
  const amount = (ing as { amount?: number | null }).amount;
  const unit = (ing as { unit?: string | null }).unit ?? "";
  if (canonical_amount != null && canonical_unit) {
    const scaled = canonical_amount * multiplier;
    const rounded = Math.round(scaled * 10) / 10;
    const suffix = `${rounded} ${canonical_unit}`;
    return name ? `${name} — ${suffix}` : suffix;
  }
  if (amount != null && (unit || canonical_unit)) {
    const scaled = amount * multiplier;
    const u = unit || (canonical_unit ?? "");
    const rounded = Math.round(scaled * 10) / 10;
    const suffix = u ? `${rounded} ${u}` : String(rounded);
    return name ? `${name} — ${suffix}` : suffix;
  }
  return ingredientDisplayLabel(ing as IngredientItem);
}
