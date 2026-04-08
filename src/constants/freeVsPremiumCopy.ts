/**
 * Экран сравнения Free vs Premium / Trial.
 */

export const FREE_VS_PREMIUM_TITLE = "Чем отличается бесплатная и полная версия";

export type FreeVsPremiumCell = "yes" | "no" | "text";

export type FreeVsPremiumRow = {
  feature: string;
  free: FreeVsPremiumCell;
  freeText?: string;
  premium: FreeVsPremiumCell;
  premiumText?: string;
};

export const FREE_VS_PREMIUM_ROWS: FreeVsPremiumRow[] = [
  { feature: "План на день", free: "yes", premium: "yes" },
  { feature: "План на неделю", free: "no", premium: "yes" },
  { feature: "Автозамена и ручная замена блюд", free: "no", premium: "yes" },
  { feature: "Список продуктов из меню", free: "no", premium: "yes" },
  { feature: "Помощь маме", free: "text", freeText: "Ограничено", premium: "text", premiumText: "Без ограничений" },
  {
    feature: "ИИ-помощник в чате, запросы в день",
    free: "text",
    freeText: "2",
    premium: "text",
    premiumText: "Без ограничений",
  },
  { feature: "Несколько профилей", free: "no", premium: "yes" },
  {
    feature: "Учёт особенностей питания",
    free: "text",
    freeText: "1 аллергия",
    premium: "text",
    premiumText: "Без ограничений",
  },
  { feature: "Любит / не любит", free: "no", premium: "yes" },
];

export const FREE_VS_PREMIUM_COL_FREE = "Free";

export const FREE_VS_PREMIUM_COL_PREMIUM = "Premium";

export const FREE_VS_PREMIUM_CTA_TRIAL = "Попробовать бесплатно";

export const FREE_VS_PREMIUM_CTA_CLOSE = "Закрыть";
