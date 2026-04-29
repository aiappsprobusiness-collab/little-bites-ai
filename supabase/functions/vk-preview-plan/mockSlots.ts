import type { MealSlot, MemberDataPool, VkPreviewMeal } from "./types.ts";
import { passesPreferenceFilters } from "../generate-plan/preferenceRules.ts";

type MockCandidate = Omit<VkPreviewMeal, "type" | "recipe_id">;

const MOCK_CANDIDATES: Record<MealSlot, MockCandidate[]> = {
  breakfast: [
    {
      title: "Овсянка с фруктами",
      description: "Мягкий завтрак, подходит детям.",
      calories: 220,
      protein: 8,
      fat: 5,
      carbs: 36,
      cooking_time_minutes: 15,
      nutrition_goals: ["energy_boost", "gentle_digestion"],
    },
    {
      title: "Завтрак с яблоком",
      description: "Сытно и без тяжести утром.",
      calories: 200,
      protein: 6,
      fat: 4,
      carbs: 38,
      cooking_time_minutes: 12,
      nutrition_goals: ["energy_boost", "balanced"],
    },
    {
      title: "Рисовая каша с тёртым яблоком",
      description: "Мягкий завтрак с кашей и фруктом.",
      calories: 210,
      protein: 7,
      fat: 5,
      carbs: 32,
      cooking_time_minutes: 15,
      nutrition_goals: ["gentle_digestion"],
    },
  ],
  lunch: [
    {
      title: "Куриный суп с лапшой",
      description: "Лёгкий обед без острого.",
      calories: 180,
      protein: 6,
      fat: 4,
      carbs: 28,
      cooking_time_minutes: 40,
      nutrition_goals: ["gentle_digestion", "balanced"],
    },
    {
      title: "Рис с тушёной куриной грудкой",
      description: "Горячее второе без супа, если супы не подходят по ограничениям.",
      calories: 220,
      protein: 14,
      fat: 8,
      carbs: 22,
      cooking_time_minutes: 35,
      nutrition_goals: ["balanced", "gentle_digestion"],
    },
    {
      title: "Гречка с мясными фрикадельками",
      description: "Сытный обед с крупой и белком.",
      calories: 240,
      protein: 16,
      fat: 9,
      carbs: 24,
      cooking_time_minutes: 30,
      nutrition_goals: ["balanced"],
    },
  ],
  dinner: [
    {
      title: "Запечённые овощи с курицей",
      description: "Нежное блюдо на ужин.",
      calories: 260,
      protein: 22,
      fat: 9,
      carbs: 18,
      cooking_time_minutes: 35,
      nutrition_goals: ["balanced", "weight_gain"],
    },
    {
      title: "Котлеты с гречкой",
      description: "Знакомое сочетание на ужин.",
      calories: 320,
      protein: 20,
      fat: 14,
      carbs: 28,
      cooking_time_minutes: 40,
      nutrition_goals: ["balanced", "weight_gain"],
    },
    {
      title: "Куриная ножка с картофельным пюре",
      description: "Знакомое сочетание на ужин, мягкая текстура.",
      calories: 250,
      protein: 18,
      fat: 10,
      carbs: 20,
      cooking_time_minutes: 30,
      nutrition_goals: ["balanced", "gentle_digestion"],
    },
  ],
  snack: [
    {
      title: "Фрукт и творожок",
      description: "Перекус без сахара.",
      calories: 140,
      protein: 10,
      fat: 4,
      carbs: 16,
      cooking_time_minutes: 5,
      nutrition_goals: ["energy_boost"],
    },
    {
      title: "Фруктовый перекус",
      description: "Лёгкая энергия между приёмами пищи.",
      calories: 90,
      protein: 1,
      fat: 0,
      carbs: 22,
      cooking_time_minutes: 3,
      nutrition_goals: ["energy_boost"],
    },
    {
      title: "Банан с печеньем",
      description: "Небольшая порция между приёмами пищи.",
      calories: 120,
      protein: 4,
      fat: 5,
      carbs: 14,
      cooking_time_minutes: 5,
      nutrition_goals: ["energy_boost", "balanced"],
    },
  ],
};

const FALLBACK: Record<MealSlot, VkPreviewMeal> = {
  breakfast: {
    type: "breakfast",
    title: "Завтрак",
    description: "Подобрано под ваши ответы.",
    calories: 200,
    protein: 8,
    fat: 6,
    carbs: 28,
    cooking_time_minutes: 15,
    nutrition_goals: ["balanced"],
  },
  lunch: {
    type: "lunch",
    title: "Обед",
    description: "Подобрано под ваши ответы.",
    calories: 220,
    protein: 14,
    fat: 8,
    carbs: 24,
    cooking_time_minutes: 35,
    nutrition_goals: ["balanced"],
  },
  dinner: {
    type: "dinner",
    title: "Ужин",
    description: "Подобрано под ваши ответы.",
    calories: 250,
    protein: 18,
    fat: 10,
    carbs: 22,
    cooking_time_minutes: 30,
    nutrition_goals: ["balanced"],
  },
  snack: {
    type: "snack",
    title: "Перекус",
    description: "Подобрано под ваши ответы.",
    calories: 100,
    protein: 3,
    fat: 4,
    carbs: 14,
    cooking_time_minutes: 5,
    nutrition_goals: ["energy_boost"],
  },
};

function memberToPreferenceProfile(member: MemberDataPool | null | undefined): {
  allergies?: string[] | null;
  dislikes?: string[] | null;
} {
  return {
    allergies: member?.allergies ?? undefined,
    dislikes: member?.dislikes ?? undefined,
  };
}

/** Первый mock-кандидат, проходящий те же фильтры, что и рецепты из БД. */
export function pickMockMealForSlot(slot: MealSlot, member: MemberDataPool | null | undefined): VkPreviewMeal {
  const profile = memberToPreferenceProfile(member);
  for (const c of MOCK_CANDIDATES[slot]) {
    const ok = passesPreferenceFilters(
      { title: c.title, description: c.description ?? "", recipe_ingredients: [] },
      profile,
    );
    if (ok) return { type: slot, ...c };
  }
  return { ...FALLBACK[slot] };
}

/** @deprecated Используйте pickMockMealForSlot с профилем; оставлено для совместимости. */
export function mockMealForSlot(slot: MealSlot): VkPreviewMeal {
  return pickMockMealForSlot(slot, undefined);
}
