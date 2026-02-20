/**
 * Shared validation for plan AI ingredients: quantity check and fallback normalization.
 * Used by generate-plan. Tested by plan_validation.test.ts.
 */

export const INGREDIENT_NUMBER_UNIT_REGEX =
  /\d+(?:[.,]\d+)?\s*(?:г|гр|g|кг|ml|мл|л|шт\.?|pcs|ч\.?\s*л\.?|ст\.?\s*л\.?|tsp|tbsp)/i;
export const INGREDIENT_QUALITATIVE_REGEX =
  /по вкусу|для подачи|щепотка|для смазки|смазк|по необходимости|для жарки/i;

export type IngredientForValidation = {
  name?: string;
  amount?: string | number;
  unit?: string;
  display_text?: string;
};

export function ingredientHasQuantity(ing: IngredientForValidation): boolean {
  const amount = ing.amount;
  const unit = (ing.unit ?? "").trim();
  const amountStr = typeof amount === "number" ? String(amount) : (amount ?? "").trim();
  const displayText = (ing.display_text ?? "").trim();
  const textToCheck = displayText || amountStr;

  if (typeof amount === "number" && unit.length > 0) return true;
  if (INGREDIENT_QUALITATIVE_REGEX.test(amountStr) || INGREDIENT_QUALITATIVE_REGEX.test(displayText)) return true;
  if (INGREDIENT_NUMBER_UNIT_REGEX.test(amountStr) || INGREDIENT_NUMBER_UNIT_REGEX.test(displayText)) return true;
  if (textToCheck.length > 0 && INGREDIENT_NUMBER_UNIT_REGEX.test(textToCheck)) return true;
  return false;
}

export function ingredientsHaveAmounts(ingredients: Array<IngredientForValidation>): boolean {
  if (!Array.isArray(ingredients) || ingredients.length < 3) return false;
  const withQty = ingredients.filter((ing) => ingredientHasQuantity(ing));
  return withQty.length >= 3;
}

/** Names where "по вкусу" is acceptable (salt, spices, herbs). */
const SPICE_SALT_HERB_REGEX =
  /соль|перец|специи|приправ|укроп|петрушк|базилик|зелен|лавров|паприк|куркум|орегано|тимьян|розмарин|горчиц|чеснок|имбир|кориц|ванил|мускат|гвоздик/i;

export function isSpiceOrSalt(name: string): boolean {
  return SPICE_SALT_HERB_REGEX.test((name ?? "").trim());
}

export function normalizeIngredientsFallback(
  ingredients: Array<{ name?: string; amount?: string; unit?: string; display_text?: string }>
): Array<{ name: string; amount: string; unit: string; display_text: string }> {
  const countable = /яйц|яблок|груш|банан|лук|зубч|дольк|ломтик|шт\.|штук/i;
  return ingredients.map((ing) => {
    const name = (ing.name ?? "").trim() || "Ингредиент";
    const amount = (ing.amount ?? "").trim();
    const unit = (ing.unit ?? "").trim();
    let display_text = (ing.display_text ?? "").trim();
    if (!ingredientHasQuantity({ name, amount, unit, display_text })) {
      const fallback = countable.test(name) ? "1 шт." : "по вкусу";
      display_text = `${name} — ${fallback}`;
    } else if (!display_text && (amount || unit)) {
      display_text = amount && unit ? `${name} — ${amount} ${unit}` : amount ? `${name} — ${amount}` : name;
    } else if (!display_text) {
      display_text = name;
    }
    return {
      name,
      amount: amount || "по вкусу",
      unit: unit || "",
      display_text,
    };
  });
}

/** Fallback only for salt/spices: set "по вкусу" for those; leave others unchanged (no mass "по вкусу" for basics). */
export function normalizeIngredientsFallbackOnlySpices(
  ingredients: Array<{ name?: string; amount?: string; unit?: string; display_text?: string }>
): Array<{ name: string; amount: string; unit: string; display_text: string }> {
  return ingredients.map((ing) => {
    const name = (ing.name ?? "").trim() || "Ингредиент";
    const amount = (ing.amount ?? "").trim();
    const unit = (ing.unit ?? "").trim();
    let display_text = (ing.display_text ?? "").trim();
    const hasQty = ingredientHasQuantity({ name, amount, unit, display_text });
    if (!hasQty && isSpiceOrSalt(name)) {
      display_text = `${name} — по вкусу`;
      return { name, amount: "по вкусу", unit: unit || "", display_text };
    }
    if (!display_text && (amount || unit)) {
      display_text = amount && unit ? `${name} — ${amount} ${unit}` : amount ? `${name} — ${amount}` : name;
    } else if (!display_text) {
      display_text = name;
    }
    return {
      name,
      amount: amount || "",
      unit: unit || "",
      display_text,
    };
  });
}

/** Build payload ingredients for create_recipe_with_steps: display_text with unit, amount only when numeric. */
export function buildIngredientPayloadItem(
  ing: { name: string; amount?: string; unit?: string; display_text?: string },
  idx: number
): { name: string; display_text: string; amount: string | null; unit: string | null; order_index: number; category: string } {
  const name = ing.name?.trim() || "Ингредиент";
  const display_text =
    ing.display_text?.trim() ||
    (ing.amount && ing.unit ? `${name} — ${ing.amount} ${ing.unit}` : ing.amount ? `${name} — ${ing.amount}` : name);
  const amountStr = String(ing.amount ?? "").trim().replace(",", ".");
  const amountNumericOnly = /^\d+(?:\.\d+)?$/.test(amountStr) ? amountStr : null;
  return {
    name,
    display_text,
    amount: amountNumericOnly,
    unit: ing.unit?.trim() || null,
    order_index: idx,
    category: "other",
  };
}
