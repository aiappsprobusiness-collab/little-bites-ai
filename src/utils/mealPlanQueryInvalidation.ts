import type { QueryClient } from "@tanstack/react-query";

/**
 * true, если queryKey — это кэш meal_plans_v2 (день, неделя или суффикс row_exists),
 * и диапазон ключа пересекает plannedDate (YYYY-MM-DD).
 */
export function mealPlanQueryTouchesPlannedDate(
  queryKey: unknown,
  userId: string | undefined,
  plannedDate: string
): boolean {
  if (!userId || !plannedDate) return false;
  if (!Array.isArray(queryKey) || queryKey[0] !== "meal_plans_v2" || queryKey[1] !== userId) return false;
  const start = queryKey[3];
  if (typeof start !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return false;
  const fourth = queryKey[4];
  const fifthIsDate = typeof fourth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fourth);
  if (fifthIsDate) {
    const end = fourth;
    return plannedDate >= start && plannedDate <= end;
  }
  return start === plannedDate;
}

/** Инвалидация только запросов плана, затрагивающих одну дату (неделя + день для этой даты). */
export function invalidateMealPlanQueriesForPlannedDate(
  queryClient: QueryClient,
  params: { userId: string | undefined; plannedDate: string }
): Promise<void> {
  if (!params.userId) return Promise.resolve();
  return queryClient.invalidateQueries({
    predicate: (q) => mealPlanQueryTouchesPlannedDate(q.queryKey, params.userId, params.plannedDate),
  });
}
