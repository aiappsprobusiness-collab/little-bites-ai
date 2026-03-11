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

/** Слова и фразы для удаления при отображении имени в списке покупок (только UI). Удаление по целым словам/фразам. */
export const DISPLAY_STRIP_WORDS = [
  "сладкое",
  "сладкий",
  "сладкая",
  "спелый",
  "спелая",
  "свежий",
  "свежая",
  "репчатый",
  "репчатая",
  "детский",
  "детское",
  "детская",
  "натуральный",
  "натуральное",
  "натуральная",
  "обогащенный",
  "обогащённый",
  "обогащённое",
] as const;

/** Фразы для удаления при display-нормализации (подстрока с пробелами). */
export const DISPLAY_STRIP_PHRASES = ["с кальцием"] as const;

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

/** Категории, для которых ложки не переводим в мл (твёрдые/сыпучие). */
const SOLID_CATEGORIES = new Set(["vegetables", "fruits", "meat", "grains"]);

export interface ShoppingAggregationInput {
  name: string;
  amount: number | null;
  unit: string | null;
  canonical_amount: number | null;
  canonical_unit: string | null;
  /** Категория из recipe_ingredients: для grains/vegetables/fruits/meat ложки не конвертируем в мл. */
  category?: string | null;
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
 * tbsp/tsp → ml только для жидкостей (dairy, other). Для твёрдых/сыпучих (grains, vegetables, fruits, meat) оставляем ст.л./ч.л.
 */
export function buildShoppingAggregationKey(
  input: ShoppingAggregationInput,
  multiplier: number
): ShoppingAggregationKeyResult | null {
  const { name, amount, unit, canonical_amount, canonical_unit, category } = input;
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

  // Ложки: для твёрдых/сыпучих (овсянка, мука, овощи и т.д.) не переводим в мл — в БД норма в г, в списке оставляем ст.л./ч.л.
  if (normalizedUnit === "tbsp" || normalizedUnit === "tsp") {
    const isSolid = category != null && SOLID_CATEGORIES.has(category.trim().toLowerCase());
    if (isSolid) {
      if (rawAmount <= 0) return null;
      return {
        key: `${normalizedName}|${normalizedUnit}`,
        aggregationUnit: normalizedUnit,
        amountToSum: rawAmount,
        originalName: name.trim(),
      };
    }
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
 * Для отображения в списке покупок: количество и единица в удобном виде.
 * Мл: при amount >= 30 показываем миллилитры (не переводим в десятки ложек); при меньших — ст.л./ч.л.
 */
export function toShoppingDisplayUnitAndAmount(
  aggregationUnit: NormalizedUnit | string | null,
  amount: number
): { displayAmount: number; displayUnit: string } {
  const rounded = Math.round(amount * 10) / 10;
  if (aggregationUnit === "ml" && amount > 0) {
    if (amount >= 30) {
      return { displayAmount: rounded, displayUnit: "мл" };
    }
    if (rounded % 15 === 0) {
      return { displayAmount: Math.round((rounded / 15) * 10) / 10, displayUnit: "ст.л." };
    }
    if (rounded % 5 === 0) {
      return { displayAmount: Math.round((rounded / 5) * 10) / 10, displayUnit: "ч.л." };
    }
    return { displayAmount: rounded, displayUnit: "мл" };
  }
  if (aggregationUnit === "g") return { displayAmount: rounded, displayUnit: "г" };
  if (aggregationUnit === "kg") return { displayAmount: rounded, displayUnit: "кг" };
  if (aggregationUnit === "l") return { displayAmount: rounded, displayUnit: "л" };
  if (aggregationUnit === "pcs") return { displayAmount: rounded, displayUnit: "шт." };
  if (aggregationUnit === "tbsp") return { displayAmount: rounded, displayUnit: "ст.л." };
  if (aggregationUnit === "tsp") return { displayAmount: rounded, displayUnit: "ч.л." };
  const u = String(aggregationUnit ?? "").trim();
  return { displayAmount: rounded, displayUnit: u || "—" };
}

/**
 * Форматирование количества для отображения: дроби для шт. (0.5 → 1/2, 0.25 → 1/4, 0.75 → 3/4).
 */
export function formatAmountForDisplay(amount: number | null, unit: string | null): string {
  if (amount == null || !Number.isFinite(amount)) return "";
  const u = (unit ?? "").trim().toLowerCase();
  if (u !== "шт." && u !== "pcs" && u !== "штука" && u !== "штук") {
    return String(amount);
  }
  if (Math.abs(amount - 0.5) < 0.01) return "1/2";
  if (Math.abs(amount - 0.25) < 0.01) return "1/4";
  if (Math.abs(amount - 0.75) < 0.01) return "3/4";
  return String(amount);
}

/**
 * Display-нормализация имени для отображения в списке покупок: базовое название без описаний.
 * Не меняет ключи агрегации и не трогает БД. Удаление по целым словам и фразам из конфига.
 */
export function normalizeIngredientDisplayName(name: string): string {
  if (name == null || typeof name !== "string") return "";
  let s = name.trim().replace(/\s+/g, " ");
  s = s.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  s = s.replace(/\s*\d+(?:[.,]\d+)?\s*%\s*/g, " ").trim();
  s = s.trim().toLowerCase();
  for (const phrase of DISPLAY_STRIP_PHRASES) {
    const re = new RegExp(escapeRegExp(phrase), "gi");
    s = s.replace(re, " ").trim();
  }
  const stripSet = new Set(DISPLAY_STRIP_WORDS.map((w) => w.toLowerCase()));
  const words = s.split(/\s+/).filter((w) => w.length > 0 && !stripSet.has(w.toLowerCase()));
  s = words.join(" ").replace(/\s+/g, " ").trim();
  if (s === "") return name.trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
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
