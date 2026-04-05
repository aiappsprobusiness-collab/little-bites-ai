/**
 * Форматирование текста списка покупок для Copy (в буфер обмена).
 * Публичный шаринг списка продуктов убран — только копирование для личного использования.
 */

import { capitalizeIngredientName } from "@/utils/ingredientDisplay";
import type { ProductCategory } from "@/hooks/useShoppingList";
import { mapDbProductCategoryToShoppingAisle } from "@/utils/shopping/mapDbProductCategoryToShoppingAisle";
import { formatShoppingListPurchaseLine } from "@/utils/shopping/shoppingListPurchaseDisplay";

const CATEGORY_ORDER: ProductCategory[] = ["vegetables", "fruits", "dairy", "meat", "grains", "other"];
const CATEGORY_LABEL: Record<ProductCategory, string> = {
  vegetables: "Овощи",
  fruits: "Фрукты",
  dairy: "Молочное",
  meat: "Мясо и рыба",
  grains: "Крупы и злаки",
  other: "Прочее",
};

export interface ShoppingListItemForFormat {
  name: string;
  amount: number | null;
  unit: string | null;
  category?: ProductCategory | null;
  merge_key?: string | null;
  aggregation_unit?: string | null;
  scaledDualDisplayAmount?: number | null;
  dualDisplayUnit?: string | null;
}

function formatItemLine(item: ShoppingListItemForFormat): string {
  const displayName = capitalizeIngredientName(item.name);
  return formatShoppingListPurchaseLine(
    {
      displayName,
      amount: item.amount,
      unit: item.unit,
      mergeKey: item.merge_key,
      aggregationUnit: item.aggregation_unit,
      scaledDualDisplayAmount: item.scaledDualDisplayAmount,
      dualDisplayUnit: item.dualDisplayUnit,
    },
    { delimiter: " — " }
  );
}

function normalizeCategory(cat: string | null | undefined): ProductCategory {
  return mapDbProductCategoryToShoppingAisle(cat);
}

/**
 * Текст для кнопки «Копировать список»: заголовок + ингредиенты по категориям, без ссылок.
 * range = today → «Список продуктов на сегодня»; range = week → «Список продуктов на неделю».
 */
export function formatShoppingListForCopy(
  items: ShoppingListItemForFormat[],
  range: "today" | "week"
): string {
  const title = range === "today" ? "Список продуктов на сегодня" : "Список продуктов на неделю";
  if (items.length === 0) return `${title}\n\n`;
  const byCategory = items.reduce((acc, item) => {
    const cat = normalizeCategory(item.category);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<ProductCategory, ShoppingListItemForFormat[]>);
  const lines: string[] = [title, ""];
  for (const cat of CATEGORY_ORDER) {
    const list = byCategory[cat];
    if (!list?.length) continue;
    lines.push(CATEGORY_LABEL[cat]);
    for (const item of list) {
      lines.push(`• ${formatItemLine(item)}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
