/** Флаг на один показ stagger-анимации списка после успешной сборки из меню. */
export const SHOPPING_LIST_ENTRANCE_SESSION_KEY = "lb_shopping_list_entrance_v1";

export function markShoppingListEntranceStagger(): void {
  try {
    sessionStorage.setItem(SHOPPING_LIST_ENTRANCE_SESSION_KEY, "1");
  } catch {
    /* private mode / quota */
  }
}
