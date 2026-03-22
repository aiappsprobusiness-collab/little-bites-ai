/**
 * Тот же выбор member_id для строк meal_plans_v2, что и на экране План:
 * Premium «Семья» → null; Free «Семья» → первый ребёнок; иначе выбранный профиль.
 * Нужен для списка покупок и агрегации ингредиентов, чтобы данные совпадали с видимым планом.
 */
export function mealPlanMemberIdForShoppingSync(params: {
  hasAccess: boolean;
  selectedMemberId: string | null | undefined;
  members: { id: string }[];
}): string | null {
  const { hasAccess, selectedMemberId, members } = params;
  const isFree = !hasAccess;
  const isFamilyMode = !isFree && selectedMemberId === "family";
  const mealPlanMemberId =
    isFree && selectedMemberId === "family"
      ? (members[0]?.id ?? undefined)
      : isFamilyMode
        ? null
        : (selectedMemberId || undefined);
  return mealPlanMemberId ?? null;
}
