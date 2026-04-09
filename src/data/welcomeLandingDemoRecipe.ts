import type { PublicRecipePayload } from "@/services/publicRecipeShare";

/**
 * Статический пример для `/welcome` без авторизации.
 * get_recipe_full для анона не отдаёт чужие рецепты — поэтому лендинг не ходит в БД за демо.
 */
export const WELCOME_LANDING_DEMO_RECIPE: PublicRecipePayload = {
  id: "welcome-landing-demo",
  title: "Куриные котлеты на пару с кабачком",
  description:
    "Нежные котлеты легко усваиваются и подходят для спокойного ужина. Богаты белком и клетчаткой — помогают надолго сохранить сытость ✔",
  meal_type: "dinner",
  cooking_time_minutes: 35,
  calories: 220,
  proteins: 28,
  fats: 8,
  carbs: 12,
  min_age_months: 12,
  max_age_months: 60,
  servings_recommended: 2,
  nutrition_goals: ["brain_development", "weight_gain"],
  ingredients: [
    { name: "куриное филе", amount: 300, unit: "г.", order_index: 1 },
    { name: "кабачок", amount: 100, unit: "г.", order_index: 2 },
    { name: "лук репчатый", amount: 0.5, unit: "шт.", order_index: 3 },
    { name: "яйцо куриное", amount: 1, unit: "шт.", order_index: 4 },
    { name: "манная крупа", amount: 2, unit: "ст.л.", order_index: 5 },
    { name: "соль", amount: 0.3, unit: "ч.л.", order_index: 6 },
  ],
  steps: [
    { step_number: 1, instruction: "Куриное филе и лук измельчите в блендере до фарша." },
    { step_number: 2, instruction: "Кабачок натрите на мелкой тёрке и отожмите лишнюю жидкость." },
    { step_number: 3, instruction: "Смешайте фарш, кабачок, яйцо, манку и соль до однородности." },
    { step_number: 4, instruction: "Сформируйте небольшие котлеты и выложите в пароварку." },
    { step_number: 5, instruction: "Готовьте на пару 20–25 минут до полной готовности. Подавайте тёплыми с овощным гарниром." },
  ],
  chef_advice: "Если добавить немного сока кабачка в фарш, котлеты получатся ещё мягче и сочнее",
  advice: null,
};
