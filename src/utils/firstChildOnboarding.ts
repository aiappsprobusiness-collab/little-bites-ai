/**
 * Создание первого профиля ребёнка: вкладка Профиль + модалка (как после письма подтверждения email).
 * Используется при 0 записей в `members` — незавершённый онбординг после регистрации или повторный вход.
 */
export const PROFILE_FIRST_CHILD_ONBOARDING =
  "/profile?openCreateProfile=1&welcome=1" as const;
