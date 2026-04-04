import type { ProductCategory } from "@/hooks/useShoppingList";
import { mapDbProductCategoryToShoppingAisle } from "./mapDbProductCategoryToShoppingAisle";
import {
  inferDbProductCategoryFromText,
  normalizeIngredientTextForCategoryMatch,
} from "@shared/dbProductCategoryFromText";

export { normalizeIngredientTextForCategoryMatch, inferDbProductCategoryFromText };

/**
 * Категория полки списка: сначала из БД; если other — эвристика по name/display_text.
 */
export function resolveProductCategoryForShoppingIngredient(
  dbCategory: string | null | undefined,
  name: string,
  displayText?: string | null,
): ProductCategory {
  const fromDb = mapDbProductCategoryToShoppingAisle(dbCategory);
  if (fromDb !== "other") return fromDb;
  const combined = normalizeIngredientTextForCategoryMatch(name, displayText);
  const inferred = inferDbProductCategoryFromText(combined);
  return mapDbProductCategoryToShoppingAisle(inferred);
}
