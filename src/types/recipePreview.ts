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
  /** source из БД: seed | manual | week_ai | chat_ai | starter. Для debug-бейджа: seed/manual → DB, остальное → AI. */
  source?: string | null;
  /** КБЖУ на порцию (от БД). Отображаются только для Premium/Trial. */
  calories?: number | null;
  proteins?: number | null;
  fats?: number | null;
  carbs?: number | null;
};
