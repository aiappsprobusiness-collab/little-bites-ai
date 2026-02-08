/**
 * UI-only view model for FavoriteCard display.
 * Normalizes recipe data with graceful fallbacks — no new backend fields.
 */

import type { StoredRecipe } from "@/hooks/useFavorites";

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

/** Extract ingredient name only (no quantity). Handles string or { name, amount } format. */
function ingredientName(ing: string | { name?: string }): string {
  if (typeof ing === "string") {
    const t = ing.trim();
    const dashIdx = t.indexOf(" — ");
    const colonIdx = t.indexOf(":");
    const sep = dashIdx >= 0 ? dashIdx : colonIdx >= 0 ? colonIdx : -1;
    return sep >= 0 ? t.slice(0, sep).trim() : t;
  }
  const name = ing?.name;
  return typeof name === "string" ? name.trim() : "";
}

export interface FavoriteCardViewModel {
  title: string;
  subtitle: string;
  childLabel: string;
  cookTimeLabel: string;
  mealTypeLabel: string | null;
  ingredientNames: string[];
  hint: string | null;
}

export function toFavoriteCardViewModel(recipe: StoredRecipe): FavoriteCardViewModel {
  const title = typeof recipe?.title === "string" ? recipe.title.trim() : "Рецепт";
  const desc = typeof recipe?.description === "string" ? recipe.description.trim() : "";
  const subtitle = desc || "";

  const childName = typeof recipe?.child_name === "string" ? recipe.child_name.trim() : "";
  const childLabel = childName ? childName : "Для ребёнка";

  const cookingTime = recipe?.cookingTime ?? (recipe as { cooking_time?: number })?.cooking_time;
  const numTime = typeof cookingTime === "number" ? cookingTime : typeof cookingTime === "string" ? parseInt(String(cookingTime), 10) : undefined;
  const cookTimeLabel = Number.isFinite(numTime) && numTime != null ? `${numTime} мин` : "~30 мин";

  const mealType = (recipe as { mealType?: string })?.mealType;
  const mealTypeLabel =
    typeof mealType === "string" && MEAL_LABELS[mealType] ? MEAL_LABELS[mealType] : null;

  const rawIngredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  const allNames = rawIngredients
    .map(ingredientName)
    .filter((n) => n.length >= 2);
  const ingredientNames = allNames;

  const chefAdvice = (recipe as { chefAdvice?: string })?.chefAdvice;
  const advice = (recipe as { advice?: string })?.advice;
  const hint = typeof chefAdvice === "string" && chefAdvice.trim()
    ? chefAdvice.trim()
    : typeof advice === "string" && advice.trim()
      ? advice.trim()
      : null;

  return {
    title,
    subtitle,
    childLabel,
    cookTimeLabel,
    mealTypeLabel,
    ingredientNames,
    hint,
  };
}
