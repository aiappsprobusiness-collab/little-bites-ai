/**
 * Тот же выбор member_id для строк meal_plans_v2, что и на экране План:
 * Premium «Семья» → null; Free «Семья» → первый ребёнок; иначе выбранный профиль.
 *
 * **undefined** — Free + «Семья», дети ещё не в `members`: scope не готов. Нельзя заменять на `null`
 * (семейная строка плана) — иначе RecipePage и MealPlanPage расходятся по кэшу `meal_plans_v2`.
 */
export function mealPlanMemberIdForShoppingSync(params: {
  hasAccess: boolean;
  selectedMemberId: string | null | undefined;
  members: { id: string }[];
}): string | null | undefined {
  const { hasAccess, selectedMemberId, members } = params;
  const isFree = !hasAccess;
  const isFamilyMode = !isFree && selectedMemberId === "family";
  if (isFree && selectedMemberId === "family") {
    return members[0]?.id ?? undefined;
  }
  if (isFamilyMode) return null;
  return (selectedMemberId || undefined) ?? null;
}
