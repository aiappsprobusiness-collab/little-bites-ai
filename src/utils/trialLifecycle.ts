/**
 * Единая логика пробного периода на клиенте (без дублирования в хуках/страницах).
 *
 * Канон по сроку trial: `profiles_v2.trial_until` (ISO), как в `useSubscription`.
 * Эффективный тариф «trial» в UI: активный срок trial и нет активного платного premium (`hasPremiumAccess`).
 */

/** Окно «скоро конец» — до окончания осталось не больше 24 ч (как TrialSoftBanner). */
export const TRIAL_ENDING_SOON_MS = 86_400_000;

export function isTrialUntilValidFuture(
  trialUntil: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (trialUntil == null || trialUntil === "") return false;
  return new Date(trialUntil).getTime() > now.getTime();
}

/** Оставшееся время до конца trial, мс; null если trial не активен по дате. */
export function getMsUntilTrialEnd(
  trialUntil: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!isTrialUntilValidFuture(trialUntil, now)) return null;
  return new Date(trialUntil!).getTime() - now.getTime();
}

/**
 * Пользователь в UI считается в режиме trial (не premium): есть будущий trial_until и нет активного premium.
 */
export function isEffectiveTrialTier(
  trialUntil: string | null | undefined,
  hasPremiumAccess: boolean,
  now: Date = new Date()
): boolean {
  if (hasPremiumAccess) return false;
  return isTrialUntilValidFuture(trialUntil, now);
}

/** Активен ли пробный период по дате (без учёта premium — как `hasTrialAccess` в хуке). */
export function isTrialAccessActiveByDate(
  trialUntil: string | null | undefined,
  now: Date = new Date()
): boolean {
  return isTrialUntilValidFuture(trialUntil, now);
}

/**
 * Осталось ≤ windowMs до конца trial, срок ещё не прошёл; premium не перекрывает (для напоминаний trial-юзеру).
 */
export function isTrialEndingSoon(
  trialUntil: string | null | undefined,
  hasPremiumAccess: boolean,
  windowMs: number = TRIAL_ENDING_SOON_MS,
  now: Date = new Date()
): boolean {
  if (hasPremiumAccess) return false;
  const ms = getMsUntilTrialEnd(trialUntil, now);
  if (ms == null) return false;
  return ms > 0 && ms <= windowMs;
}

/**
 * Trial закончился «естественно»: триал когда-то был (trial_used), дата окончания в прошлом, нет premium.
 * Для модалки «доступ завершён» после входа в приложение.
 */
export function isPostTrialExpiredNatural(
  trialUsed: boolean | null | undefined,
  trialUntil: string | null | undefined,
  hasPremiumAccess: boolean,
  now: Date = new Date()
): boolean {
  if (hasPremiumAccess) return false;
  if (!trialUsed) return false;
  if (trialUntil == null || trialUntil === "") return false;
  return new Date(trialUntil).getTime() <= now.getTime();
}

/** Для заголовка напоминания: конец trial в календарный «сегодня» по локали устройства. */
export function isTrialEndDateSameCalendarDayAs(
  trialUntil: string | null | undefined,
  reference: Date = new Date()
): boolean {
  if (trialUntil == null || trialUntil === "") return false;
  const end = new Date(trialUntil);
  return (
    end.getDate() === reference.getDate() &&
    end.getMonth() === reference.getMonth() &&
    end.getFullYear() === reference.getFullYear()
  );
}
