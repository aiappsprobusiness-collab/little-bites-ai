/**
 * Единое правило: откуда брать member_id при лайке/избранном.
 * - План: из слота/контекста плана (member_id карточки).
 * - Чат: из выбранного профиля (pill); "Семья" / нет выбора → null.
 * - Деталка рецепта: из route state (fromMealPlan/fromChat) или текущий профиль, иначе null.
 */

export type FavoriteSource = "plan" | "chat" | "recipe_detail" | "favorites_tab";

export interface ResolveFavoriteMemberIdParams {
  source: FavoriteSource;
  /** Из плана: member_id слота (строка дня). */
  slotMemberId?: string | null;
  /** Текущий выбранный профиль в приложении (pill). "family" или отсутствие → null. */
  selectedMemberId?: string | null;
  /** Из деталки: state при навигации (например из плана/чата). */
  routeStateMemberId?: string | null;
}

/**
 * Возвращает member_id для записи в favorites_v2.
 * null = "Для семьи".
 */
export function resolveFavoriteMemberId(params: ResolveFavoriteMemberIdParams): string | null {
  const { source, slotMemberId, selectedMemberId, routeStateMemberId } = params;

  if (source === "plan" && slotMemberId !== undefined) {
    return slotMemberId ?? null;
  }

  if (source === "chat") {
    if (selectedMemberId == null || selectedMemberId === "family" || selectedMemberId === "") {
      return null;
    }
    return selectedMemberId;
  }

  if (source === "recipe_detail") {
    if (routeStateMemberId !== undefined && routeStateMemberId !== null && routeStateMemberId !== "") {
      return routeStateMemberId;
    }
    if (selectedMemberId != null && selectedMemberId !== "family" && selectedMemberId !== "") {
      return selectedMemberId;
    }
    return null;
  }

  if (source === "favorites_tab") {
    return null;
  }

  if (selectedMemberId != null && selectedMemberId !== "family" && selectedMemberId !== "") {
    return selectedMemberId;
  }
  return null;
}
