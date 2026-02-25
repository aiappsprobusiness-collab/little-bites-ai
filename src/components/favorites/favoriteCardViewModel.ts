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

/** Extract display text for chip. Prefer display_text, else name, else "name — amount". */
function ingredientName(ing: string | { name?: string; display_text?: string | null; amount?: string }): string {
  if (typeof ing === "string") {
    const t = ing.trim();
    const dashIdx = t.indexOf(" — ");
    const colonIdx = t.indexOf(":");
    const sep = dashIdx >= 0 ? dashIdx : colonIdx >= 0 ? colonIdx : -1;
    return sep >= 0 ? t.slice(0, sep).trim() : t;
  }
  const dt = (ing as { display_text?: string | null }).display_text;
  if (typeof dt === "string" && dt.trim()) return dt.trim();
  const name = ing?.name;
  const amount = (ing as { amount?: string }).amount?.trim();
  return amount ? `${(name ?? "").trim()} — ${amount}`.trim() || (name ?? "").trim() : (name ?? "").trim();
}

export interface FavoriteCardViewModel {
  title: string;
  subtitle: string;
  childLabel: string;
  cookTimeLabel: string;
  cookingTimeMinutes: number | null;
  mealTypeLabel: string | null;
  ingredientNames: string[];
  ingredientTotalCount: number;
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

  // Предпочтение: ingredientNames из preview (RPC get_recipe_previews) — только названия
  const fromPreview = (recipe as { ingredientNames?: string[]; ingredientTotalCount?: number }).ingredientNames;
  const ingredientNames = Array.isArray(fromPreview) && fromPreview.length > 0
    ? fromPreview.filter((n) => n && String(n).trim().length >= 2)
    : (() => {
        const rawIngredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
        return rawIngredients.map(ingredientName).filter((n) => n.length >= 2);
      })();
  const ingredientTotalCount = typeof (recipe as { ingredientTotalCount?: number }).ingredientTotalCount === 'number'
    ? (recipe as { ingredientTotalCount: number }).ingredientTotalCount
    : ingredientNames.length;

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
    cookingTimeMinutes: Number.isFinite(numTime) && numTime != null ? numTime : null,
    mealTypeLabel,
    ingredientNames,
    ingredientTotalCount,
    hint,
  };
}
