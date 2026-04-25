export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type VkPreviewPlanRequest = {
  age_months: number;
  allergies: string[];
  likes: string[];
  dislikes: string[];
  entry_point?: "vk";
  utm?: Record<string, string>;
};

export type VkPreviewMeal = {
  type: MealSlot;
  title: string;
  description?: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  /** Минуты приготовления (recipes.cooking_time_minutes / cooking_time). */
  cooking_time_minutes?: number;
  /** Ключи целей питания (whitelist как в recipes.nutrition_goals). */
  nutrition_goals?: string[];
};

export type DayPlanMeta = {
  fallback_source: "db" | "ai" | "mock" | "db+ai";
  duration_ms: number;
  missing_slots?: MealSlot[];
};

export type DayPlan = {
  meals: VkPreviewMeal[];
  meta: DayPlanMeta;
};

export type RecipeRowPool = {
  id: string;
  title: string;
  norm_title?: string | null;
  description: string | null;
  meal_type?: string | null;
  source?: string | null;
  is_soup?: boolean | null;
  max_age_months?: number | null;
  min_age_months?: number | null;
  calories?: number | string | null;
  proteins?: number | string | null;
  fats?: number | string | null;
  carbs?: number | string | null;
  cooking_time_minutes?: number | null;
  cooking_time?: number | null;
  recipe_ingredients?: Array<{ name?: string; display_text?: string; category?: string | null }> | null;
  score?: number | null;
  trust_level?: string | null;
  nutrition_goals?: unknown;
};

export type MemberDataPool = {
  allergies?: string[];
  likes?: string[];
  dislikes?: string[];
  age_months?: number;
  type?: string | null;
};
