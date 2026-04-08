/**
 * Единый source of truth для текстов и пунктов ценности UnifiedPaywall.
 * Не зависит от paywall_reason — причина открытия только для аналитики.
 */

export const UNIFIED_PAYWALL_TITLE = "Спокойствие за питание ребёнка — каждый день";

export const UNIFIED_PAYWALL_SUBTITLE =
  "Мы уже продумали, что приготовить, и поможем, если что-то не подойдёт";

export const UNIFIED_PAYWALL_BULLETS: readonly string[] = [
  "Готовый план питания без лишних раздумий",
  "Быстрая замена блюд",
  "Подсказки и помощь в любой ситуации",
  "Экономия времени каждый день",
];

export const UNIFIED_PAYWALL_FOOTER = "Можно отменить в любой момент";

/** Единые формулировки про пробный период во всех paywall (вместо «Триал» / «trial» в UI). */
export const PAYWALL_TRIAL_ALREADY_USED = "Пробный период уже использован";
export const PAYWALL_TRIAL_ACTIVE_HINT = "У вас активен пробный период";
/** Мягкий баннер / custom message перед открытием paywall (остаток trial). */
export const PAYWALL_TRIAL_ENDS_TODAY = "Пробный период закончится сегодня";
export const PAYWALL_TRIAL_ENDS_TOMORROW = "Пробный период закончится завтра";
