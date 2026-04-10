/**
 * Общие строки UnifiedPaywall (футер, подсказки trial) и запасной тон бренда.
 * Основной контент по сценарию — `paywallReasonCopy.ts` (контекст по `paywall_reason`).
 */

/** Запасной «герой» если когда-то понадобится без причины; в UI по умолчанию берётся getPaywallReasonCopy. */
export const UNIFIED_PAYWALL_TITLE = "MomRecipes рядом каждый день";

export const UNIFIED_PAYWALL_SUBTITLE =
  "Полная версия снимает лимиты бесплатного плана — меньше суеты, больше опоры";

export const UNIFIED_PAYWALL_BULLETS: readonly string[] = [
  "Понятно, что без доступа часть сценариев закрыта",
  "В полной версии — план, замены, чат и помощь в одном ритме",
  "Попробуйте бесплатно 3 дня или оформите полный доступ",
];

export const UNIFIED_PAYWALL_FOOTER = "Можно отменить в любой момент";

/** Единые формулировки про пробный период во всех paywall (вместо «Триал» / «trial» в UI). */
export const PAYWALL_TRIAL_ALREADY_USED = "Пробный период уже использован";
export const PAYWALL_TRIAL_ACTIVE_HINT = "У вас активен пробный период";
/** Мягкий баннер / custom message перед открытием paywall (остаток trial). */
export const PAYWALL_TRIAL_ENDS_TODAY = "Пробный период закончится сегодня";
export const PAYWALL_TRIAL_ENDS_TOMORROW = "Пробный период закончится завтра";
