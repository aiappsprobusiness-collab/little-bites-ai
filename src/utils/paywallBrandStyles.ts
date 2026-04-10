/**
 * Единый «брендовый» визуал paywall / premium-гейтов:
 * олива (`primary`, `primary-pill-surface`), без тяжёлого градиента на всей карточке;
 * градиент `primary → --primary-gradient-end` только на главной CTA.
 *
 * Подключать в модалках и bottom sheet’ах с подпиской.
 */

/** Затемнение за модалкой: мягче стандартного `black/50` + лёгкий blur */
export const PAYWALL_OVERLAY = "bg-black/40 backdrop-blur-[2px]";

/** Карточка bottom-sheet / motion-модалки (без `to-secondary` — убирает «грязный» низ) */
export const PAYWALL_MODAL_CARD =
  "bg-background border border-border/40 shadow-2xl rounded-t-2xl sm:rounded-2xl";

/** Верхняя скролл-зона: лёгкий оливковый тинт */
export const PAYWALL_MODAL_SCROLL_TINT =
  "bg-gradient-to-b from-primary-pill-surface/55 via-background to-background";

/** Нижняя панель с тарифами и CTA — сплошной фон */
export const PAYWALL_MODAL_BOTTOM_PANEL = "border-t border-primary/10 bg-background";

/** Обёртка блока тарифов (`PaywallSubscriptionPlans`); задать padding отдельно (`p-2` / `p-3`). */
export const PAYWALL_PLANS_CONTAINER = "rounded-xl border border-primary/20 bg-primary-pill-surface/45";

/** Блок иконки премиума (корона и т.п.): рамка оливковая, ~толщина штриха иконки (2px) */
export const PAYWALL_HERO_ICON_WRAP =
  "rounded-xl border-2 border-primary bg-primary-pill-surface/90 shadow-sm shadow-primary/10";

export const PAYWALL_HERO_ICON_CLASS = "text-primary";

/**
 * Главная CTA подписки / trial — единственное место с сильным градиентом.
 * Добавлять к `Button` вместе с размерами (`h-12`, `rounded-xl`, …).
 */
export const PAYWALL_PRIMARY_CTA =
  "bg-gradient-to-r from-primary to-[var(--primary-gradient-end)] text-primary-foreground shadow-md shadow-primary/25 hover:opacity-[0.97]";

/** Вторичная кнопка оплаты (outline) */
export const PAYWALL_OUTLINE_PAY_CTA =
  "border-2 border-border/70 bg-muted/40 text-foreground font-semibold shadow-sm hover:bg-muted/55";

/** Overlay для `Sheet` — передать в `overlayClassName` у `SheetContent` */
export const PAYWALL_SHEET_OVERLAY = PAYWALL_OVERLAY;

/**
 * Поверхность bottom sheet с paywall-контекстом (лёгкий тинт + верхний акцент).
 */
export const PAYWALL_SHEET_SURFACE =
  "bg-gradient-to-b from-primary-pill-surface/40 from-0% to-background border-t border-primary/10";
