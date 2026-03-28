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

/** Микро-текст над блоком выбора тарифа (месяц / год). */
export const UNIFIED_PAYWALL_PRICING_CAPTION =
  "Самый удобный способ планировать питание для семьи";

export const UNIFIED_PAYWALL_FOOTER = "Можно отменить в любой момент";
