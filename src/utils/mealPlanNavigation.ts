/** Query-параметр на `/meal-plan`: выбранный день в rolling-7 (локальная дата `YYYY-MM-DD`). */
export const MEAL_PLAN_DATE_QUERY_PARAM = "date";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Путь возврата на План с восстановлением дня после карточки рецепта (и прямой переход). */
export function mealPlanPathWithOptionalDate(plannedDate: string | null | undefined): string {
  if (plannedDate && YMD_RE.test(plannedDate)) {
    return `/meal-plan?${MEAL_PLAN_DATE_QUERY_PARAM}=${encodeURIComponent(plannedDate)}`;
  }
  return "/meal-plan";
}
