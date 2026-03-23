import type { ProductCategory, SourceRecipe } from "@/hooks/useShoppingList";
import {
  buildShoppingAggregationKey,
  chooseShoppingDisplayName,
  normalizeIngredientDisplayName,
  toShoppingDisplayUnitAndAmount,
} from "@/utils/shopping/normalizeIngredientForShopping";
import {
  inferDbProductCategoryFromText,
  normalizeIngredientTextForCategoryMatch,
  resolveProductCategoryForShoppingIngredient,
} from "@/utils/shopping/inferShoppingCategoryFromIngredient";

/** meta.shopping_list_items: источники рецептов и стабильный ключ слияния. */
export type ShoppingListItemMeta = {
  source_recipes?: SourceRecipe[];
  merge_key?: string;
};

/** Одна позиция для merge в список (из плана или из карточки рецепта). */
export type ShoppingIngredientPayload = {
  name: string;
  amount: number | null;
  unit: string | null;
  category: ProductCategory | null;
  merge_key: string;
  source_recipes?: SourceRecipe[];
};

/** Легаси-ключ как в первой версии addRecipeIngredients: trim lower name + точная строка unit. */
export function legacyShoppingLineKey(name: string, unit: string | null | undefined): string {
  return `${(name ?? "").trim().toLowerCase()}|${unit ?? ""}`;
}

export type RecipeIngredientRowForShopping = {
  name: string;
  amount: number | null;
  unit: string | null;
  canonical_amount: number | null;
  canonical_unit: string | null;
  display_text: string | null;
};

/** Ингредиенты из get_recipe_full / recipe.ingredients (RPC) → строки для агрегации списка покупок. */
export function recipeRpcIngredientsToShoppingRows(ingredients: unknown[] | undefined): RecipeIngredientRowForShopping[] {
  if (!Array.isArray(ingredients)) return [];
  return ingredients
    .map((raw) => {
      const o = raw as Record<string, unknown>;
      const amt = o.amount;
      const num =
        typeof amt === "number"
          ? amt
          : amt != null && String(amt).trim() !== ""
            ? parseFloat(String(amt))
            : null;
      const can = o.canonical_amount;
      const canNum =
        typeof can === "number"
          ? can
          : can != null && String(can).trim() !== ""
            ? Number(can)
            : null;
      const cu = o.canonical_unit;
      return {
        name: String(o.name ?? ""),
        amount: num != null && Number.isFinite(num) ? num : null,
        unit: o.unit != null ? String(o.unit) : null,
        canonical_amount: canNum != null && Number.isFinite(canNum) ? canNum : null,
        canonical_unit: cu === "g" || cu === "ml" ? cu : null,
        display_text: o.display_text != null ? String(o.display_text) : null,
      };
    })
    .filter((r) => r.name.trim().length > 0);
}

/**
 * Строки ингредиентов рецепта → payload для списка покупок (та же логика, что loadPlanShoppingIngredients для одного рецепта).
 * Дубликаты merge_key в одной партии суммируются.
 */
export function buildShoppingIngredientPayloadsFromRecipe(
  rows: RecipeIngredientRowForShopping[],
  multiplier: number,
  recipeId: string,
  recipeTitle: string
): ShoppingIngredientPayload[] {
  const source: SourceRecipe = { id: recipeId, title: recipeTitle.trim() };
  const byKey = new Map<string, ShoppingIngredientPayload>();

  for (const ing of rows) {
    const rawCat = inferDbProductCategoryFromText(
      normalizeIngredientTextForCategoryMatch(ing.name, ing.display_text)
    );
    const res = buildShoppingAggregationKey(
      {
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        canonical_amount: ing.canonical_amount,
        canonical_unit: ing.canonical_unit,
        category: rawCat,
      },
      multiplier
    );
    if (res == null) continue;

    const { displayAmount, displayUnit } = toShoppingDisplayUnitAndAmount(res.aggregationUnit, res.amountToSum);
    const nameForUi = normalizeIngredientDisplayName(chooseShoppingDisplayName([res.originalName]));
    const category = resolveProductCategoryForShoppingIngredient(rawCat, ing.name, ing.display_text);

    const prev = byKey.get(res.key);
    if (prev) {
      prev.amount = (prev.amount ?? 0) + (displayAmount ?? 0);
    } else {
      byKey.set(res.key, {
        name: nameForUi,
        amount: displayAmount,
        unit: displayUnit,
        category,
        merge_key: res.key,
        source_recipes: [source],
      });
    }
  }

  return [...byKey.values()];
}

export function shoppingRowMatchesPayload(
  row: { name: string; unit: string | null; meta?: ShoppingListItemMeta | null },
  payload: ShoppingIngredientPayload
): boolean {
  const rowMk = row.meta?.merge_key;
  const payMk = payload.merge_key;
  if (rowMk && payMk) return rowMk === payMk;
  return legacyShoppingLineKey(row.name, row.unit) === legacyShoppingLineKey(payload.name, payload.unit);
}

/**
 * Объединить meta.source_recipes с новым рецептом; выставить merge_key (поддержка строк без ключа).
 */
export function mergeShoppingItemMeta(
  row: {
    meta?: ShoppingListItemMeta | null;
    recipe_id?: string | null;
    recipe_title?: string | null;
  },
  newRecipe: SourceRecipe | null,
  mergeKeyForRow: string
): ShoppingListItemMeta {
  const existing = row.meta?.source_recipes ?? (row.recipe_id ? [{ id: row.recipe_id, title: row.recipe_title ?? "" }] : []);
  const byId = new Map(existing.map((r) => [r.id, r]));
  if (newRecipe) byId.set(newRecipe.id, newRecipe);
  const arr = [...byId.values()];
  const out: ShoppingListItemMeta = { merge_key: mergeKeyForRow };
  if (arr.length > 0) out.source_recipes = arr;
  return out;
}
