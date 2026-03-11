/**
 * Нормализация ингредиентов только для агрегации списка покупок.
 * Не меняет данные рецептов в БД и не влияет на карточки рецептов.
 */

/** Суффиксы/прилагательные, которые не меняют базовый продукт (для ключа агрегации). */
export const STRIP_SUFFIXES = [
  "спелый",
  "спелая",
  "свежий",
  "свежая",
  "свежие",
  "репчатый",
  "репчатая",
] as const;

/**
 * Нормализует имя ингредиента только для ключа агрегации списка покупок.
 * Приведение к lowercase, удаление скобок, процентов жирности, описательных суффиксов.
 */
export function normalizeIngredientNameForShopping(name: string): string {
  if (name == null || typeof name !== "string") return "";
  let s = name.trim().toLowerCase().replace(/\s+/g, " ");
  // Удалить текст в скобках (включая скобки)
  s = s.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  // Удалить проценты жирности: 10%, 20%, 3.2% и т.п.
  s = s.replace(/\s*\d+(?:[.,]\d+)?\s*%\s*/g, " ").trim();
  // Убрать описательные суффиксы (как отдельные слова)
  for (const suffix of STRIP_SUFFIXES) {
    const re = new RegExp(`\\s+${escapeRegExp(suffix)}\\s*$`, "i");
    s = s.replace(re, "").trim();
    const re2 = new RegExp(`^${escapeRegExp(suffix)}\\s+`, "i");
    s = s.replace(re2, "").trim();
  }
  return s.replace(/\s+/g, " ").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Нормализованные единицы для ключа агрегации (латиница). */
export type NormalizedUnit = "g" | "ml" | "kg" | "l" | "pcs" | "tbsp" | "tsp" | null;

const UNIT_TO_NORMALIZED: Record<string, NormalizedUnit> = {
  г: "g",
  гр: "g",
  грамм: "g",
  грамма: "g",
  граммов: "g",
  g: "g",
  мл: "ml",
  ml: "ml",
  миллилитр: "ml",
  миллилитра: "ml",
  миллилитров: "ml",
  кг: "kg",
  kg: "kg",
  л: "l",
  l: "l",
  литр: "l",
  литра: "l",
  литров: "l",
  шт: "pcs",
  "шт.": "pcs",
  штука: "pcs",
  штук: "pcs",
  штуки: "pcs",
  pcs: "pcs",
  "ст.л.": "tbsp",
  "ст л": "tbsp",
  "ст. л.": "tbsp",
  столовая: "tbsp",
  ложка: "tbsp",
  "ч.л.": "tsp",
  "ч л": "tsp",
  "ч. л.": "tsp",
  чайная: "tsp",
};

/**
 * Нормализует единицу измерения для ключа агрегации.
 * Приоритет: canonical_unit (g/ml), иначе разбор unit.
 */
export function normalizeIngredientUnitForShopping(
  unit?: string | null,
  canonicalUnit?: string | null
): NormalizedUnit {
  if (canonicalUnit === "g" || canonicalUnit === "ml") return canonicalUnit;
  if (unit == null || unit === "") return null;
  const u = unit.trim().toLowerCase().replace(/\s+/g, " ");
  const normalized = UNIT_TO_NORMALIZED[u];
  if (normalized) return normalized;
  // Частичное совпадение для "столовая ложка" / "чайная ложка"
  if (u.includes("столовая") || u.includes("ст.л") || u === "ст л") return "tbsp";
  if (u.includes("чайная") || u.includes("ч.л") || u === "ч л") return "tsp";
  return null;
}

/** Коэффициенты перевода ложек в мл (только для агрегации списка покупок). */
export const SPOON_TO_ML = { tbsp: 15, tsp: 5 } as const;

export interface ShoppingAggregationInput {
  name: string;
  amount: number | null;
  unit: string | null;
  canonical_amount: number | null;
  canonical_unit: string | null;
}

export interface ShoppingAggregationKeyResult {
  /** Ключ для группировки: normalizedName | normalizedUnit */
  key: string;
  /** Единица для ключа (после конвертации tbsp/tsp → ml); для неизвестных — сырая строка */
  aggregationUnit: NormalizedUnit | string;
  /** Количество в единицах агрегации (уже с множителем порций) */
  amountToSum: number;
  /** Исходное имя (для выбора отображаемого) */
  originalName: string;
}

/**
 * Строит ключ агрегации и возвращает данные для суммирования.
 * tbsp/tsp конвертируются в ml (1 tbsp = 15 ml, 1 tsp = 5 ml).
 * Если canonical_unit g/ml есть — используем его; иначе единица из unit (г/мл → g/ml).
 */
export function buildShoppingAggregationKey(
  input: ShoppingAggregationInput,
  multiplier: number
): ShoppingAggregationKeyResult | null {
  const { name, amount, unit, canonical_amount, canonical_unit } = input;
  const normalizedName = normalizeIngredientNameForShopping(name);
  if (normalizedName === "") return null;

  const rawAmount = (amount ?? 0) * multiplier;
  const canAmount = (canonical_amount ?? 0) * multiplier;

  // Приоритет: canonical g/ml
  if (canonical_unit === "g" || canonical_unit === "ml") {
    const amt = Number.isFinite(canAmount) && canAmount > 0 ? canAmount : rawAmount;
    if (amt <= 0) return null;
    return {
      key: `${normalizedName}|${canonical_unit}`,
      aggregationUnit: canonical_unit,
      amountToSum: amt,
      originalName: name.trim(),
    };
  }

  const normalizedUnit = normalizeIngredientUnitForShopping(unit, canonical_unit);
  if (normalizedUnit === null) {
    // Неизвестная единица — ключ по сырому unit, чтобы не склеивать с чем попало; для отображения сохраняем как есть
    const u = (unit ?? "").trim() || "?";
    const amt = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0;
    if (amt <= 0) return null;
    return {
      key: `${normalizedName}|${u}`,
      aggregationUnit: u,
      amountToSum: amt,
      originalName: name.trim(),
    };
  }

  // Конвертация ложек в мл для единого ключа
  if (normalizedUnit === "tbsp" || normalizedUnit === "tsp") {
    const mlPerSpoon = SPOON_TO_ML[normalizedUnit];
    const amountMl = rawAmount * mlPerSpoon;
    if (amountMl <= 0) return null;
    return {
      key: `${normalizedName}|ml`,
      aggregationUnit: "ml",
      amountToSum: amountMl,
      originalName: name.trim(),
    };
  }

  // g, ml, kg, l, pcs — используем amount (сырой), чтобы мл и ml склеивались
  const amt = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0;
  if (amt <= 0) return null;
  return {
    key: `${normalizedName}|${normalizedUnit}`,
    aggregationUnit: normalizedUnit,
    amountToSum: amt,
    originalName: name.trim(),
  };
}

/**
 * Выбирает отображаемое имя для списка покупок: короткое и «чистое».
 * Мягкая display-нормализация: убрать скобки и проценты, затем выбрать самое короткое.
 * Первая буква для UI может быть с заглавной (вызывающий код может применить capitalize).
 */
export function chooseShoppingDisplayName(names: string[]): string {
  if (names.length === 0) return "";
  const cleaned = names.map((n) => {
    let s = n.trim();
    s = s.replace(/\s*\([^)]*\)\s*/g, " ").trim();
    s = s.replace(/\s*\d+(?:[.,]\d+)?\s*%\s*/g, " ").trim();
    return s.replace(/\s+/g, " ").trim();
  });
  const shortest = cleaned.reduce((a, b) => (a.length <= b.length ? a : b));
  return shortest || names[0]?.trim() || "";
}
