export type RecipePreview = {
  id: string;
  title: string;
  description?: string | null;
  cookTimeMinutes?: number | null;
  ingredientNames: string[];
  ingredientTotalCount: number;
  minAgeMonths?: number | null;
  maxAgeMonths?: number | null;
  isFavorite: boolean;
  /** Совет шефа (Premium). */
  chefAdvice?: string | null;
  /** Мини-совет (Free). */
  advice?: string | null;
};
