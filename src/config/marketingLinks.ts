/**
 * Короткие ссылки /go/:slug → редирект на приложение с UTM (и лог marketing_link_click).
 * Добавляйте новые slug здесь; при необходимости расширяйте MarketingLinkEntry.
 */

export interface MarketingLinkEntry {
  /** Относительный путь с query (например "/?utm_...") или абсолютный URL */
  url: string;
  /** Источник для properties.source в usage_events (по умолчанию youtube_short_link) */
  source?: string;
}

export const MARKETING_LINKS: Record<string, MarketingLinkEntry> = {
  breakfast01: {
    url: "/?utm_source=youtube&utm_medium=shorts&utm_campaign=breakfast_kids&utm_content=eggs_01",
  },
};

export type MarketingLinkSlug = keyof typeof MARKETING_LINKS;
