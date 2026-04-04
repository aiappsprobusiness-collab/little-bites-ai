/**
 * Политика кэша для SPA-переходов между основными вкладками (chat / meal-plan / favorites):
 * данные остаются свежими в пределах окна без повторного fetch при каждом mount.
 * Критичные обновления по-прежнему через invalidateQueries после мутаций.
 */
export const TAB_NAV_STALE_MS = 120_000; // 2 мин — профиль, члены семьи, избранное, списки рецептов
export const TAB_NAV_USAGE_STALE_MS = 60_000; // лимиты чата/help — refetchUsage после отправки сообщений
