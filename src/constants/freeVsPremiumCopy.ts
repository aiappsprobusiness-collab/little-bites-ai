/**
 * Экран сравнения бесплатной и полной версии.
 */

export const FREE_VS_PREMIUM_TITLE = "Чем отличается бесплатная и полная версия";

export const FREE_VS_PREMIUM_DESCRIPTION =
  "В бесплатной версии есть базовые функции. В полной — всё, чтобы не думать о питании каждый день";

export type FreeVsPremiumCell = "yes" | "no" | "text";

export type FreeVsPremiumRow = {
  feature: string;
  free: FreeVsPremiumCell;
  freeText?: string;
  premium: FreeVsPremiumCell;
  premiumText?: string;
};

export const FREE_VS_PREMIUM_ROWS: FreeVsPremiumRow[] = [
  {
    feature: "План питания",
    free: "text",
    freeText: "Только на день",
    premium: "text",
    premiumText: "На всю неделю",
  },
  {
    feature: "Замена блюд",
    free: "text",
    freeText: "Ограничено",
    premium: "text",
    premiumText: "Без ограничений",
  },
  {
    feature: "Чат",
    free: "text",
    freeText: "Несколько вопросов в день",
    premium: "text",
    premiumText: "Без ограничений",
  },
  {
    feature: "Профили детей",
    free: "text",
    freeText: "Ограничено",
    premium: "text",
    premiumText: "Для всей семьи",
  },
  {
    feature: "Подбор рецептов",
    free: "text",
    freeText: "Базовый",
    premium: "text",
    premiumText: "Персональный",
  },
];

export const FREE_VS_PREMIUM_COL_FREE = "Free";

export const FREE_VS_PREMIUM_COL_PREMIUM = "Premium";

export const FREE_VS_PREMIUM_CTA_TRIAL = "Попробовать бесплатно 3 дня";

export const FREE_VS_PREMIUM_CTA_CLOSE = "Закрыть";
