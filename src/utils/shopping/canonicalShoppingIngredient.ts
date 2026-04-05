/**
 * Канонический слой имён для агрегации shopping list (высокий confidence).
 * Не заменяет данные рецептов; используется только при buildShoppingAggregationKey.
 */

/** ё → е для стабильного ключа (перец чёрный = перец черный). */
export function applyYoToE(s: string): string {
  return s.replace(/ё/g, "е").replace(/Ё/g, "Е");
}

/**
 * После normalizeIngredientNameForShopping: явные алиасы → один сегмент ключа (slug).
 * Ключи — только «безопасные» синонимы; спорные пары (твердый/мягкий тофу, черри/помидор) сюда не входят.
 */
export const CANONICAL_NAME_ALIASES: Readonly<Record<string, string>> = {
  // Яйца
  яйцо: "яйца",
  яйца: "яйца",
  "яйцо куриное": "яйца",
  "яйца куриные": "яйца",
  // Гречка
  гречка: "гречка",
  "гречневая крупа": "гречка",
  // Масло растительное (порядок слов)
  "растительное масло": "масло растительное",
  "масло растительное": "масло растительное",
  // Лимонный сок
  "сок лимона": "лимонный сок",
  "лимонный сок": "лимонный сок",
};

/** Предпочитаемое отображаемое имя для канонического сегмента (если задано). */
export const CANONICAL_DISPLAY_NAME: Readonly<Record<string, string>> = {
  яйца: "Яйца куриные",
  гречка: "Гречка",
  "масло растительное": "Масло растительное",
  "лимонный сок": "Лимонный сок",
};

/**
 * Грамм на 1 шт. для овощей (стартовый high-confidence набор).
 * Если в display_text есть «(N г)», приоритет у парсинга (см. parseGramsPerPieceFromDisplayText).
 */
export const SHOPPING_PCS_TO_GRAMS: Readonly<Record<string, number>> = {
  лук: 100,
  морковь: 100,
  картофель: 100,
  /** После ё→е в ключе всегда «свекла». */
  свекла: 150,
  /** Сладкий / болгарский перец — ориентир для агрегации шт.→г в списке покупок. */
  "болгарский перец": 90,
  "перец болгарский": 90,
  "сладкий перец": 90,
};

/**
 * Сегмент ключа после normalizeIngredientNameForShopping + ё→е + алиасы.
 */
export function resolveCanonicalShoppingNameSegment(baseNormalized: string): { segment: string } {
  const yo = applyYoToE(baseNormalized).trim();
  const aliased = CANONICAL_NAME_ALIASES[yo] ?? yo;
  return { segment: aliased };
}

/**
 * Из display_text вида «1 шт. (100 г)» / «2 шт. (200 г)» — грамм на одну штуку: total_г / amount_шт.
 */
export function parseGramsPerPieceFromDisplayText(
  displayText: string | null | undefined,
  amountPcs: number
): number | null {
  if (displayText == null || typeof displayText !== "string") return null;
  const m = displayText.match(/\((\d+(?:[.,]\d+)?)\s*г\)/i);
  if (!m) return null;
  const totalG = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(totalG) || totalG <= 0) return null;
  const ap = amountPcs > 0 ? amountPcs : 1;
  return totalG / ap;
}

export function getPreferredShoppingDisplayNameForCanonicalSegment(
  segment: string,
  fallbackFromNames: string
): string {
  const d = CANONICAL_DISPLAY_NAME[segment];
  if (d) return d;
  return fallbackFromNames;
}

export function isShoppingPcsToGramsEligibleCanonicalSegment(segment: string): boolean {
  const s = applyYoToE(segment.trim().toLowerCase());
  return Object.prototype.hasOwnProperty.call(SHOPPING_PCS_TO_GRAMS, s);
}
