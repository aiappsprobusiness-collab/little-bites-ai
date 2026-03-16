/**
 * Stage 2.3: мягкий guard от излишне "ресторанной" лексики в title.
 * Только очевидные и безопасные замены (соте → тушёные овощи и т.п.).
 */

/** Нежелательные подстроки в title и безопасная замена (если одна подстрока — замена для всего фрагмента). */
const TITLE_LEXICON_REPLACEMENTS: Array<{ pattern: RegExp; replace: string }> = [
  { pattern: /\bовощное соте\b/gi, replace: "тушёные овощи" },
  { pattern: /\bсоте из овощей\b/gi, replace: "тушёные овощи" },
  { pattern: /\bсоте\b/gi, replace: "тушёное" },
];

export interface TitleLexiconGuardResult {
  triggered: boolean;
  normalizedTitle?: string;
}

/**
 * Проверяет title на нежелательную лексику и возвращает нормализованный вариант при безопасной замене.
 */
export function checkTitleLexicon(title: string): TitleLexiconGuardResult {
  const t = (title ?? "").trim();
  if (!t) return { triggered: false };

  let out = t;
  for (const { pattern, replace } of TITLE_LEXICON_REPLACEMENTS) {
    out = out.replace(pattern, replace).replace(/\s+/g, " ").trim();
  }

  if (out !== t && out.length >= 2) {
    return { triggered: true, normalizedTitle: out };
  }
  return { triggered: false };
}
