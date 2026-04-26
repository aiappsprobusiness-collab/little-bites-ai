export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type VkPreviewMeal = {
  type: MealSlot;
  /** UUID из БД для deeplink (опционально; AI/mock могут не иметь id). */
  recipe_id?: string;
  title: string;
  description?: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  cooking_time_minutes?: number;
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

export type VkDraft = {
  version: 1;
  created_at: number;
  expires_at: number;
  entry_point: "vk";
  age_months: number;
  allergies: string[];
  likes: string[];
  dislikes: string[];
  dayPlanPreview: DayPlan | null;
  vk_session_id: string;
  /** После успешного создания профиля из handoff — не префиллить повторно */
  handoff_consumed?: boolean;
};
