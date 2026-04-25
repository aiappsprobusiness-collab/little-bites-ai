import type { MealSlot, VkPreviewMeal } from "./types.ts";

const MOCK_BY_SLOT: Record<MealSlot, VkPreviewMeal> = {
  breakfast: {
    type: "breakfast",
    title: "Овсянка с фруктами",
    description: "Мягкий завтрак, подходит детям.",
    calories: 220,
    protein: 8,
    fat: 5,
    carbs: 36,
    cooking_time_minutes: 15,
    nutrition_goals: ["energy_boost", "gentle_digestion"],
  },
  lunch: {
    type: "lunch",
    title: "Овощной суп с лапшой",
    description: "Лёгкий обед без острого.",
    calories: 180,
    protein: 6,
    fat: 4,
    carbs: 28,
    cooking_time_minutes: 40,
    nutrition_goals: ["gentle_digestion", "balanced"],
  },
  dinner: {
    type: "dinner",
    title: "Запечённые овощи с курицей",
    description: "Нежное блюдо на ужин.",
    calories: 260,
    protein: 22,
    fat: 9,
    carbs: 18,
    cooking_time_minutes: 35,
    nutrition_goals: ["balanced", "weight_gain"],
  },
  snack: {
    type: "snack",
    title: "Фрукт и творожок",
    description: "Перекус без сахара.",
    calories: 140,
    protein: 10,
    fat: 4,
    carbs: 16,
    cooking_time_minutes: 5,
    nutrition_goals: ["energy_boost"],
  },
};

export function mockMealForSlot(slot: MealSlot): VkPreviewMeal {
  return { ...MOCK_BY_SLOT[slot] };
}
