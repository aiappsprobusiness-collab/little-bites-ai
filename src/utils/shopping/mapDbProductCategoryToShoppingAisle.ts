import type { ProductCategory } from "@/hooks/useShoppingList";

/**
 * `product_category` в БД (recipe_ingredients, shopping_list_items): vegetables … + fish, fats, spices.
 * В приложении список покупок — 6 «проходов магазина» (без отдельной полки fish).
 */
export function mapDbProductCategoryToShoppingAisle(cat: string | null | undefined): ProductCategory {
  if (cat == null || String(cat).trim() === "") return "other";
  const c = String(cat).trim().toLowerCase();
  if (["vegetables", "fruits", "dairy", "meat", "grains", "other"].includes(c)) return c as ProductCategory;
  if (c === "fish") return "meat";
  if (c === "fats" || c === "spices") return "other";
  return "other";
}
