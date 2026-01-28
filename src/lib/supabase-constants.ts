/**
 * Оптимизированные select для снижения Supabase egress.
 * Используются во всех запросах к recipes / chat_history.
 */

/** Колонки для списков рецептов (без embed). */
export const RECIPES_LIST_SELECT =
  'id, title, image_url, created_at, cooking_time_minutes, is_favorite, tags, child_id, description, rating';

/**
 * Select для одного рецепта с ингредиентами и шагами.
 * Лимиты embed: recipe_ingredients 5, recipe_steps 3 — через .limit(..., { referencedTable }).
 */
export const RECIPES_DETAIL_SELECT = `${RECIPES_LIST_SELECT}, ingredients:recipe_ingredients(name, amount, unit), steps:recipe_steps(instruction, step_number)`;

/** Минимальные поля chat_history для отображения. */
export const CHAT_HISTORY_SELECT = 'id, message, response, created_at, user_id, child_id, message_type';

export const RECIPES_PAGE_SIZE = 10;
export const CHAT_LAST_MESSAGES = 5;
export const SUPABASE_DEBOUNCE_MS = 200;
