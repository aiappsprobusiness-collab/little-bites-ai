/**
 * Легаси статические маркетинговые ссылки (fallback, если строки нет в БД `marketing_links`).
 * Новые ссылки создаются через админку `/admin/marketing-links` или API `createMarketingLink` в `src/utils/marketingLinks.ts`.
 */

export type MarketingLinkEntry = {
  url: string;
};

/** Статические slug — только для обратной совместимости. */
export const STATIC_MARKETING_LINKS: Record<string, MarketingLinkEntry> = {
  breakfast01: {
    url: "/?utm_source=youtube&utm_medium=shorts&utm_campaign=breakfast_kids&utm_content=eggs_01",
  },
};

export function getStaticMarketingLink(slug: string): MarketingLinkEntry | undefined {
  const key = slug.trim();
  if (!key) return undefined;
  return STATIC_MARKETING_LINKS[key];
}
