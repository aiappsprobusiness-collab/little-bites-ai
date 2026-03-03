/**
 * Домен: тип приёма пищи из запроса + дефолты (servings, maxCookingTime).
 */

export { isExplicitDishRequest, inferMealTypeFromQuery } from "../../../_shared/mealType/inferMealType.ts";
export type { MealType } from "../../../_shared/mealType/inferMealType.ts";

/** Дефолт порций при отсутствии в запросе. */
export const DEFAULT_SERVINGS = 1;

/** Дефолт макс. времени готовки (мин) при отсутствии в запросе. Не подставляется в промпт — только граница. */
export const DEFAULT_MAX_COOKING_TIME: number | null = null;
