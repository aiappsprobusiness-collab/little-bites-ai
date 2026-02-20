import type { useQueryClient } from "@tanstack/react-query";

/** Обновить кэш планов после replace_slot (optimistic update). Поддерживает замену существующего слота и добавление в пустой. */
export function applyReplaceSlotToPlanCache(
  queryClient: ReturnType<typeof useQueryClient>,
  keys: { mealPlansKeyWeek: unknown[]; mealPlansKeyDay: unknown[] },
  payload: { dayKey: string; mealType: string; newRecipeId: string; title: string; plan_source: "pool" | "ai" },
  memberId?: string | null
) {
  const newItem = {
    id: `filled_${payload.dayKey}_${payload.mealType}`,
    planned_date: payload.dayKey,
    meal_type: payload.mealType,
    recipe_id: payload.newRecipeId,
    recipe: { id: payload.newRecipeId, title: payload.title },
    child_id: memberId ?? null,
    member_id: memberId ?? null,
    plan_source: payload.plan_source,
  };
  const updater = (old: Array<{ planned_date: string; meal_type: string; recipe_id: string | null; recipe: { id: string; title: string } | null; plan_source?: string }> | undefined) => {
    if (!old) return old;
    const idx = old.findIndex((item) => item.planned_date === payload.dayKey && item.meal_type === payload.mealType);
    if (idx >= 0) {
      return old.map((item, i) =>
        i === idx ? { ...item, recipe_id: payload.newRecipeId, recipe: { id: payload.newRecipeId, title: payload.title }, plan_source: payload.plan_source } : item
      );
    }
    return [...old, newItem];
  };
  queryClient.setQueryData(keys.mealPlansKeyWeek, updater);
  queryClient.setQueryData(keys.mealPlansKeyDay, updater);
}
