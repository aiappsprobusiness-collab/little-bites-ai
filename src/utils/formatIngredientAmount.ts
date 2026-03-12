/**
 * Локализация единиц измерения для UI рецептов: всегда русский.
 * В интерфейсе показываем: г, кг, мл, л, шт., ч. л., ст. л.
 */
const UNIT_TO_RU: Record<string, string> = {
  g: "г",
  gram: "г",
  grams: "г",
  kg: "кг",
  ml: "мл",
  milliliter: "мл",
  milliliters: "мл",
  l: "л",
  liter: "л",
  liters: "л",
  litre: "л",
  litres: "л",
  pcs: "шт.",
  pc: "шт.",
  piece: "шт.",
  pieces: "шт.",
  шт: "шт.",
  "шт.": "шт.",
  tsp: "ч. л.",
  "ч.л.": "ч. л.",
  "ч. л.": "ч. л.",
  tbsp: "ст. л.",
  "ст.л.": "ст. л.",
  "ст. л.": "ст. л.",
};

function normalizeUnitKey(u: string): string {
  return u.trim().toLowerCase();
}

/**
 * Возвращает русскую единицу для отображения.
 * Если единица неизвестна, возвращает исходную (обрезанную).
 */
export function localizeUnit(unit: string | null | undefined): string {
  const u = unit?.trim();
  if (u == null || u === "") return "";
  const key = normalizeUnitKey(u);
  return UNIT_TO_RU[key] ?? u;
}

/**
 * Форматирует число для UI: целое без десятичных, дробное — запятая, макс. 1 знак.
 * Для поштучных (шт.) — не показывать лишние нули (2,0 → 2).
 */
function formatAmountForDisplay(amount: number, isCountUnit: boolean): string {
  if (!Number.isFinite(amount)) return "0";
  const rounded = isCountUnit ? Math.round(amount * 10) / 10 : Math.round(amount * 10) / 10;
  const isInteger = Math.abs(rounded - Math.round(rounded)) < 1e-6;
  if (isInteger) return String(Math.round(rounded));
  const oneDecimal = Math.round(rounded * 10) / 10;
  const str = oneDecimal.toFixed(1);
  return str.replace(".", ",");
}

/** Единицы, которые считаем «поштучными» (дробные показываем как 1,5 шт., не 3/2). */
const COUNT_UNIT_KEYS = new Set(["шт.", "шт", "pcs", "pc", "piece", "pieces"]);

function isCountUnit(unit: string | null | undefined): boolean {
  if (!unit?.trim()) return false;
  const ru = localizeUnit(unit);
  return COUNT_UNIT_KEYS.has(ru) || COUNT_UNIT_KEYS.has(normalizeUnitKey(unit));
}

/**
 * Единый formatter количества ингредиента для UI.
 * - Локализует единицы на русский (г, мл, шт., ч. л., ст. л.).
 * - Дробные значения: запятая, макс. 1 знак (1,5 шт., не 3/2).
 * - Целые без .0 (2 шт., не 2,0 шт.).
 */
export function formatIngredientAmountForDisplay(
  amount: number,
  unit: string | null | undefined
): string {
  if (!Number.isFinite(amount)) return localizeUnit(unit) ? `0 ${localizeUnit(unit)}` : "0";
  const u = localizeUnit(unit);
  const isCount = isCountUnit(unit);
  const formattedAmount = formatAmountForDisplay(amount, isCount);
  if (!u) return formattedAmount;
  return `${formattedAmount} ${u}`;
}

/** Паттерн: число (целое или с точкой) + пробел + латинская единица в конце строки */
const AMOUNT_UNIT_SUFFIX = /(\d+(?:\.\d+)?)\s+(g|kg|ml|l|pcs?|piece|pieces|tsp|tbsp)\s*$/i;

/**
 * Локализует единицы в уже собранной строке (например display_text из API).
 * Заменяет суффикс вида "150 ml" на "150 мл" и т.д.
 */
export function localizeAmountUnitInDisplayText(text: string): string {
  const match = text.match(AMOUNT_UNIT_SUFFIX);
  if (!match) return text;
  const amount = parseFloat(match[1]);
  const unit = match[2];
  const formatted = formatIngredientAmountForDisplay(amount, unit);
  return text.slice(0, match.index) + formatted;
}
