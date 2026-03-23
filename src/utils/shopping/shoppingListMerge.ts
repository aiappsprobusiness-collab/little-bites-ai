import type { ProductCategory, SourceRecipe } from "@/hooks/useShoppingList";
import {
  buildShoppingAggregationKey,
  shoppingListDisplayNameFromAggregationKey,
  toShoppingDisplayUnitAndAmount,
} from "@/utils/shopping/normalizeIngredientForShopping";
import {
  inferDbProductCategoryFromText,
  normalizeIngredientTextForCategoryMatch,
  resolveProductCategoryForShoppingIngredient,
} from "@/utils/shopping/inferShoppingCategoryFromIngredient";

/** Вклад рецепта в строку (в единицах aggregation_unit, как amountToSum в агрегации). */
export type ShoppingSourceContribution = {
  recipe_id: string;
  amount_sum: number;
};

/** meta.shopping_list_items: источники рецептов и стабильный ключ слияния. */
export type ShoppingListItemMeta = {
  source_recipes?: SourceRecipe[];
  merge_key?: string;
  /** Вклады по recipe_id для пересчёта количества при фильтре по рецептам. */
  source_contributions?: ShoppingSourceContribution[];
  /** Единица для toShoppingDisplayUnitAndAmount при суммировании вкладов. */
  aggregation_unit?: string | null;
};

/** Одна позиция для merge в список (из плана или из карточки рецепта). */
export type ShoppingIngredientPayload = {
  name: string;
  amount: number | null;
  unit: string | null;
  category: ProductCategory | null;
  merge_key: string;
  source_recipes?: SourceRecipe[];
  source_contributions?: ShoppingSourceContribution[];
  aggregation_unit?: string | null;
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
        display_text: ing.display_text,
        category: rawCat,
      },
      multiplier
    );
    if (res == null) continue;

    const { displayAmount, displayUnit } = toShoppingDisplayUnitAndAmount(res.aggregationUnit, res.amountToSum);
    const nameForUi = shoppingListDisplayNameFromAggregationKey(res.key, [res.originalName]);
    const category = resolveProductCategoryForShoppingIngredient(rawCat, ing.name, ing.display_text);

    const prev = byKey.get(res.key);
    const contrib: ShoppingSourceContribution = { recipe_id: recipeId, amount_sum: res.amountToSum };
    const aggUnitStr =
      typeof res.aggregationUnit === "string" ? res.aggregationUnit : res.aggregationUnit != null ? String(res.aggregationUnit) : null;
    if (prev) {
      prev.amount = (prev.amount ?? 0) + (displayAmount ?? 0);
      const list = prev.source_contributions ?? [];
      const idx = list.findIndex((c) => c.recipe_id === recipeId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], amount_sum: list[idx].amount_sum + res.amountToSum };
        prev.source_contributions = list;
      } else {
        prev.source_contributions = [...list, contrib];
      }
      if (aggUnitStr != null) prev.aggregation_unit = aggUnitStr;
    } else {
      byKey.set(res.key, {
        name: nameForUi,
        amount: displayAmount,
        unit: displayUnit,
        category,
        merge_key: res.key,
        source_recipes: [source],
        source_contributions: [contrib],
        aggregation_unit: aggUnitStr,
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

/** Слить вклады по recipe_id (добавление из рецепта / merge строк). */
export function mergeContributionMaps(
  a: ShoppingSourceContribution[] | undefined,
  b: ShoppingSourceContribution[] | undefined
): ShoppingSourceContribution[] | undefined {
  if (!a?.length && !b?.length) return undefined;
  const m = new Map<string, number>();
  for (const c of a ?? []) m.set(c.recipe_id, (m.get(c.recipe_id) ?? 0) + c.amount_sum);
  for (const c of b ?? []) m.set(c.recipe_id, (m.get(c.recipe_id) ?? 0) + c.amount_sum);
  const out = [...m.entries()].map(([recipe_id, amount_sum]) => ({ recipe_id, amount_sum }));
  return out.length ? out : undefined;
}

/**
 * Объединить meta.source_recipes с новым рецептом; выставить merge_key (поддержка строк без ключа).
 * delta — вклады из новой партии (добавление из карточки рецепта).
 */
export function mergeShoppingItemMeta(
  row: {
    meta?: ShoppingListItemMeta | null;
    recipe_id?: string | null;
    recipe_title?: string | null;
  },
  newRecipe: SourceRecipe | null,
  mergeKeyForRow: string,
  contributionMerge?: {
    delta?: ShoppingSourceContribution[];
    aggregation_unit?: string | null;
  }
): ShoppingListItemMeta {
  const existing = row.meta?.source_recipes ?? (row.recipe_id ? [{ id: row.recipe_id, title: row.recipe_title ?? "" }] : []);
  const byId = new Map(existing.map((r) => [r.id, r]));
  if (newRecipe) byId.set(newRecipe.id, newRecipe);
  const arr = [...byId.values()];
  const out: ShoppingListItemMeta = { merge_key: mergeKeyForRow };
  if (arr.length > 0) out.source_recipes = arr;

  const merged = mergeContributionMaps(row.meta?.source_contributions, contributionMerge?.delta);
  if (merged?.length) out.source_contributions = merged;
  const agg = contributionMerge?.aggregation_unit ?? row.meta?.aggregation_unit;
  if (agg != null && String(agg).trim() !== "") out.aggregation_unit = agg;
  return out;
}
