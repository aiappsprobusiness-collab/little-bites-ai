/**
 * Локальный расчёт canonical g/ml до enrichIngredientMeasurementForSave.
 * Порт подмножества SQL: normalize_ingredient_unit + конвертация tsp/tbsp/pcs → g/ml
 * (SQL ingredient_canonical хранит pcs/tsp/tbsp как есть; enrich требует только g|ml).
 */

export type EnrichCanonical = { amount: number; unit: "g" | "ml" };

/** Порт public.normalize_ingredient_unit — возвращает нормализованный код или null. */
export function normalizeIngredientUnit(unit: string | null | undefined): string | null {
  if (unit == null) return null;
  let u = unit.trim().toLowerCase();
  if (!u) return null;
  u = u.replace(/\.$/, "");
  if (["г", "гр", "g", "грамм"].includes(u)) return "g";
  if (["кг", "kg", "килограмм"].includes(u)) return "kg";
  if (["мл", "ml", "миллилитр"].includes(u)) return "ml";
  if (["л", "l", "литр"].includes(u)) return "l";
  if (["шт", "шт.", "pcs", "штук", "штуки"].includes(u)) return "pcs";
  if (["ч.л", "ч.л.", "чайная ложка", "tsp", "чл", "ч. л.", "ч. л"].includes(u)) return "tsp";
  if (["ст.л", "ст.л.", "столовая ложка", "tbsp", "стл", "ст. л.", "ст. л"].includes(u)) return "tbsp";
  return null;
}

const ML_PER_TSP = 5;
const ML_PER_TBSP = 15;

const EGG_RE = /яйц|яйко/i;
const BANANA_RE = /банан/i;
const CLOVE_RE = /зубчик/i;

/** Грубые граммы на штуку (как в ingredientMeasurementEngine по смыслу). */
function pieceCountToGrams(n: number, name: string, rawUnitTail: string): EnrichCanonical {
  const combined = `${name} ${rawUnitTail}`;
  if (EGG_RE.test(combined)) return { amount: round2(n * 55), unit: "g" };
  if (BANANA_RE.test(combined)) return { amount: round2(n * 100), unit: "g" };
  if (CLOVE_RE.test(combined)) return { amount: round2(n * 5), unit: "g" };
  return { amount: round2(n * 90), unit: "g" };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Известное количество + сырой хвост единицы → g/ml для enrich.
 * rawUnitTail: «г», «шт.», «ч. л.» и т.д.
 */
export function tryResolveEnrichCanonicalFromParsedAmount(
  amountNum: number,
  rawUnitTail: string,
  productName: string,
): EnrichCanonical | null {
  if (!Number.isFinite(amountNum) || amountNum <= 0) return null;
  const norm = normalizeIngredientUnit(rawUnitTail);
  if (!norm && EGG_RE.test(`${productName} ${rawUnitTail}`)) {
    return { amount: round2(amountNum * 55), unit: "g" };
  }
  if (!norm) return null;
  if (norm === "kg") return { amount: round2(amountNum * 1000), unit: "g" };
  if (norm === "l") return { amount: round2(amountNum * 1000), unit: "ml" };
  if (norm === "g") return { amount: round2(amountNum), unit: "g" };
  if (norm === "ml") return { amount: round2(amountNum), unit: "ml" };
  if (norm === "tsp") return { amount: round2(amountNum * ML_PER_TSP), unit: "ml" };
  if (norm === "tbsp") return { amount: round2(amountNum * ML_PER_TBSP), unit: "ml" };
  if (norm === "pcs") return pieceCountToGrams(amountNum, productName, rawUnitTail);
  return null;
}

/** «2 шт.», «100 г», «1,5 кг» → число + хвост (как в parse_ingredient_display_text tail). */
export function parseSimpleNumericQuantity(text: string): { amount: number; rawUnit: string } | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const rawUnit = (m[2] ?? "").trim();
  return { amount, rawUnit };
}

/**
 * Парсинг строки количества в g/ml (дроби Unicode, ст.л./ч.л., г, мл, кг, л).
 * Перенесено из deepseek-chat/index.ts.
 */
export function parseAmountToCanonical(amountText: string): EnrichCanonical | null {
  const t = (amountText ?? "").trim();
  if (!t.length) return null;
  const numMatch = t.match(/[\d½¼¾⅓⅔⅛⅜⅝⅞]+|(\d+)\s*\/\s*(\d+)/);
  const numStr = numMatch?.[0];
  if (!numStr) return null;
  let amount = 0;
  if (numStr.includes("/")) {
    const [a, b] = numStr.split("/").map((s) => parseInt(s.trim(), 10));
    amount = Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : parseFloat(numStr) || 0;
  } else {
    amount = parseFloat(numStr.replace(",", ".")) || 0;
  }
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const rest = t.replace(numStr, "").replace(/,/g, ".").trim().toLowerCase();
  if (/\b(г|грамм|граммов)\b/.test(rest)) return { amount: Math.round(amount * 100) / 100, unit: "g" };
  if (/\b(кг|килограмм)\b/.test(rest)) return { amount: Math.round(amount * 1000 * 100) / 100, unit: "g" };
  if (/\b(мл|миллилитр|миллилитров)\b/.test(rest)) return { amount: Math.round(amount * 100) / 100, unit: "ml" };
  if (/\b(л|литр|литров)\b/.test(rest)) return { amount: Math.round(amount * 1000 * 100) / 100, unit: "ml" };
  if (/\b(ст\.?\s*л\.?|столовых?\s*ложек?)\b/.test(rest)) return { amount: Math.round(amount * ML_PER_TBSP * 100) / 100, unit: "ml" };
  if (/\b(ч\.?\s*л\.?|чайных?\s*ложек?)\b/.test(rest)) return { amount: Math.round(amount * ML_PER_TSP * 100) / 100, unit: "ml" };
  if (/\bг\b/.test(rest) && !/мл|л\b/.test(rest)) return { amount: Math.round(amount * 100) / 100, unit: "g" };
  if (/\bмл\b/.test(rest)) return { amount: Math.round(amount * 100) / 100, unit: "ml" };
  return null;
}

export function resolveCanonicalForEnrichInput(input: {
  name: string;
  amountLine: string;
  llmCanonical?: { amount: number; unit: string } | null;
}): EnrichCanonical | null {
  const { name, amountLine, llmCanonical } = input;
  if (
    llmCanonical != null &&
    (llmCanonical.unit === "g" || llmCanonical.unit === "ml") &&
    Number.isFinite(llmCanonical.amount) &&
    llmCanonical.amount > 0
  ) {
    return { amount: llmCanonical.amount, unit: llmCanonical.unit };
  }
  const line = (amountLine ?? "").trim();
  if (!line) return null;
  const fromParse = parseAmountToCanonical(line);
  if (fromParse) return fromParse;
  const simple = parseSimpleNumericQuantity(line);
  if (!simple) return null;
  if (!simple.rawUnit) {
    if (EGG_RE.test(name)) return tryResolveEnrichCanonicalFromParsedAmount(simple.amount, "шт.", name);
    return null;
  }
  return tryResolveEnrichCanonicalFromParsedAmount(simple.amount, simple.rawUnit, name);
}

/** Собрать строку количества для резолва (клиент: amount + unit или хвост display_text). */
export function buildAmountLineForCanonicalResolve(options: {
  amount?: string | number | null;
  unit?: string | null;
  display_text?: string | null;
}): string {
  const amt = options.amount != null && options.amount !== "" ? String(options.amount).trim() : "";
  const u = options.unit != null && options.unit !== "" ? String(options.unit).trim() : "";
  if (amt && u && /^\d+[.,]?\d*$/.test(amt.replace(",", "."))) {
    return `${amt} ${u}`;
  }
  if (amt && /[^\d\s.,]/.test(amt)) return amt;
  const d = (options.display_text ?? "").trim();
  const dash = d.indexOf("—");
  if (dash >= 0) {
    const after = d.slice(dash + 1).trim();
    if (after.length > 0) return after;
  }
  if (/^\d+\s*(г|мл|шт|ст\.|ч\.|кг|л)/i.test(d)) return d;
  return amt;
}

/**
 * Полный резолв для canonicalizeRecipePayload: учитывает уже заданные canonical_* (любые),
 * иначе строка из amount/unit/display_text.
 */
export function resolveCanonicalForEnrichFromIngredient(options: {
  name: string;
  amount?: string | number | null;
  unit?: string | null;
  display_text?: string | null;
  canonical_amount?: number | string | null;
  canonical_unit?: string | null;
}): EnrichCanonical | null {
  const name = (options.name ?? "").trim() || "Ингредиент";
  const rawCanon = options.canonical_amount;
  const canonNum =
    rawCanon != null && String(rawCanon).trim() !== ""
      ? Number(String(rawCanon).replace(",", "."))
      : NaN;
  const cu0 = (options.canonical_unit ?? "").trim().toLowerCase();
  if (Number.isFinite(canonNum) && canonNum > 0 && (cu0 === "g" || cu0 === "ml")) {
    return { amount: canonNum, unit: cu0 as "g" | "ml" };
  }
  const amountLine = buildAmountLineForCanonicalResolve({
    amount: options.amount,
    unit: options.unit,
    display_text: options.display_text,
  });
  return resolveCanonicalForEnrichInput({ name, amountLine, llmCanonical: null });
}
