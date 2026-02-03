/**
 * Группировка ингредиентов формата "Продукт — количество".
 * Одинаковый продукт + одинаковая единица → сумма.
 * Одинаковый продукт + разные единицы → отдельные строки под одним заголовком.
 */

import { parseIngredient } from "./parseIngredient";
import { resolveUnit } from "./productUtils";
import { looksLikeInstruction } from "./parseIngredient";

export interface AggregatedVariant {
  quantity: number;
  unit: string;
}

export interface AggregatedIngredient {
  productName: string;
  variants: AggregatedVariant[];
}

/**
 * Парсит строку "Продукт — количество" в { productName, quantity, unit }
 */
function parseLine(raw: string): { productName: string; quantity: number; unit: string } | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || looksLikeInstruction(trimmed)) return null;

  const parsed = parseIngredient(trimmed);
  const productName = parsed.name?.trim();
  if (!productName) return null;

  const unit = resolveUnit(parsed.unit, productName);
  const quantity = parsed.quantity ?? (unit === "шт" ? 1 : 0);
  return { productName, quantity, unit };
}

/**
 * Агрегирует массив строк ["Продукт — количество"]:
 * - Одинаковый продукт + одинаковая единица → сумма
 * - Одинаковый продукт + разные единицы → отдельные варианты под одним продуктом
 */
export function aggregateIngredients(ingredients: string[]): AggregatedIngredient[] {
  const byProduct = new Map<string, Map<string, number>>();

  for (const raw of ingredients) {
    const parsed = parseLine(raw);
    if (!parsed) continue;

    const key = parsed.productName.toLowerCase().trim();
    const unitKey = (parsed.unit || "шт").toLowerCase().trim();

    if (!byProduct.has(key)) {
      byProduct.set(key, new Map());
    }
    const unitMap = byProduct.get(key)!;
    const existing = unitMap.get(unitKey) ?? 0;
    unitMap.set(unitKey, existing + parsed.quantity);
  }

  const result: AggregatedIngredient[] = [];
  for (const [key, unitMap] of byProduct.entries()) {
    const productName = key.charAt(0).toUpperCase() + key.slice(1);
    const variants: AggregatedVariant[] = Array.from(unitMap.entries()).map(
      ([unit, quantity]) => ({ quantity, unit })
    );
    result.push({ productName, variants });
  }
  return result;
}

/**
 * Преобразует агрегированный результат обратно в строки "Продукт — количество"
 */
export function toIngredientStrings(aggregated: AggregatedIngredient[]): string[] {
  const out: string[] = [];
  for (const { productName, variants } of aggregated) {
    for (const { quantity, unit } of variants) {
      out.push(`${productName} — ${quantity} ${unit}`);
    }
  }
  return out;
}
