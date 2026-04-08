/**
 * Единый source of truth для текстов и пунктов ценности UnifiedPaywall.
 * Не зависит от paywall_reason — причина открытия только для аналитики.
 */

export const UNIFIED_PAYWALL_TITLE = "Полный доступ без ограничений";

export const UNIFIED_PAYWALL_SUBTITLE = "Планируйте питание и готовьте без ограничений";

export const UNIFIED_PAYWALL_BULLETS: readonly string[] = [
  "Одно меню для всей семьи (до 7 профилей)",
  "Рецепты с учётом возраста и аллергий",
  "Быстрая замена блюд и гибкое планирование",
  "Список продуктов на всю неделю",
  "Помощь и идеи по питанию в любой ситуации",
];

export const UNIFIED_PAYWALL_FOOTER = "Можно отменить в любой момент";

/** Единые формулировки про пробный период во всех paywall (вместо «Триал» / «trial» в UI). */
export const PAYWALL_TRIAL_ALREADY_USED = "Пробный период уже использован";
export const PAYWALL_TRIAL_ACTIVE_HINT = "У вас активен пробный период";
/** Мягкий баннер / custom message перед открытием paywall (остаток trial). */
export const PAYWALL_TRIAL_ENDS_TODAY = "Пробный период закончится сегодня";
export const PAYWALL_TRIAL_ENDS_TOMORROW = "Пробный период закончится завтра";
