import type { PublicRecipePayload } from "@/services/publicRecipeShare";

/**
 * Статический пример для `/welcome` без авторизации.
 * get_recipe_full для анона не отдаёт чужие рецепты — поэтому лендинг не ходит в БД за демо.
 */
export const WELCOME_LANDING_DEMO_RECIPE: PublicRecipePayload = {
  id: "welcome-landing-demo",
  title: "Омлет с кабачком",
  description: null,
  meal_type: "breakfast",
  cooking_time_minutes: 15,
  calories: 220,
  proteins: 14,
  fats: 12,
  carbs: 14,
  min_age_months: 12,
  max_age_months: null,
  nutrition_goals: ["iron", "gentle"],
  ingredients: [
    { name: "яйцо куриное", amount: 2, unit: "шт", order_index: 1 },
    { name: "кабачок", amount: 80, unit: "г", order_index: 2 },
    { name: "молоко", amount: 2, unit: "ст.л.", order_index: 3 },
    { name: "твёрдый сыр", amount: 20, unit: "г", order_index: 4 },
    { name: "оливковое масло", amount: 1, unit: "ч.л.", order_index: 5 },
  ],
  steps: [
    { step_number: 1, instruction: "Кабачок натереть на тёрке, слегка отжать лишнюю влагу." },
    { step_number: 2, instruction: "Взбить яйца с молоком, добавить кабачок и тёртый сыр, перемешать." },
    { step_number: 3, instruction: "Разогреть сковороду с маслом, вылить смесь и готовить на среднем огне под крышкой 6–8 минут, до схватывания." },
  ],
  chef_advice: "Если ребёнок осторожно относится к зелени, начните с меньшей порции кабачка и постепенно увеличивайте.",
  advice: null,
};
