/**
 * Двойной формат ингредиентов: UX-слой поверх canonical (g/ml).
 * Математика порций — только по canonical_amount / canonical_unit.
 */

import { inferDbProductCategoryFromText, normalizeIngredientTextForCategoryMatch } from "./dbProductCategoryFromText.ts";

export type MeasurementMode = "canonical_only" | "dual" | "display_only";

export type IngredientMeasurementInput = {
  name?: string | null;
  display_text?: string | null;
  amount?: number | null;
  unit?: string | null;
  canonical_amount?: number | null;
  canonical_unit?: string | null;
  category?: string | null;
  display_amount?: number | null;
  display_unit?: string | null;
  display_quantity_text?: string | null;
  measurement_mode?: string | null;
  note?: string | null;
};

const MEAT_FISH_DAIRY_GRAINS_NAME_RE =
  /фарш|филе|котлет|стейк|говядин|свинин|индейк|куриц|баранин|телятин|лосос|треск|тунец|форел|семг|судак|минтай|творог|йогурт|сыр\b|моцарел|рикотт|круп|овсян|греч|рис\b|булгур|киноа|перлов|макарон|паста\b|лапш|мука\b|хлеб/i;

/** Явные исключения: не форсировать dual для «весовых» продуктов. */
export function shouldUseDualMeasurement(input: IngredientMeasurementInput): boolean {
  const name = (input.name ?? "").trim();
  const displayText = (input.display_text ?? "").trim();
  const combined = normalizeIngredientTextForCategoryMatch(name, displayText);
  if (!combined) return false;

  if (/по вкусу|для подачи/i.test(displayText)) return false;

  const cat =
    input.category && String(input.category).trim()
      ? String(input.category).trim().toLowerCase()
      : inferDbProductCategoryFromText(combined);

  if (cat === "meat" || cat === "fish" || cat === "dairy" || cat === "grains") {
    if (MEAT_FISH_DAIRY_GRAINS_NAME_RE.test(combined)) return false;
  }

  const cu = (input.canonical_unit ?? "").trim().toLowerCase();
  if (cu !== "g" && cu !== "ml") return false;
  const ca = input.canonical_amount;
  if (ca == null || !Number.isFinite(Number(ca)) || Number(ca) <= 0) return false;

  if (cat === "vegetables" || cat === "fruits") return true;
  if (cat === "spices" || cat === "fats") return true;

  if (/(чеснок|чесноч)/i.test(combined)) return true;
  if (/(^|\s)лук(\s|$)|репчат/i.test(combined)) return true;

  return false;
}

const UNIT_TO_RU: Record<string, string> = {
  g: "г",
  ml: "мл",
  pcs: "шт.",
  шт: "шт.",
  "шт.": "шт.",
  tsp: "ч. л.",
  tbsp: "ст. л.",
};

function localizeUnit(u: string): string {
  const t = u.trim();
  if (!t) return "";
  const key = t.toLowerCase();
  return UNIT_TO_RU[key] ?? t;
}

/** Число для UI: запятая, макс. 1 знак после запятой. */
export function formatAmountRu(amount: number, isPieceLike: boolean): string {
  if (!Number.isFinite(amount)) return "0";
  const rounded = Math.round(amount * 10) / 10;
  const isInteger = Math.abs(rounded - Math.round(rounded)) < 1e-6;
  if (isInteger) return String(Math.round(rounded));
  const oneDecimal = Math.round(rounded * 10) / 10;
  return oneDecimal.toFixed(1).replace(".", ",");
}

function isPieceUnit(u: string): boolean {
  const ru = localizeUnit(u);
  return ru === "шт." || /^шт/i.test(u.trim());
}

export function formatCanonicalSuffix(canonicalAmount: number, canonicalUnit: string | null | undefined): string {
  const u = (canonicalUnit ?? "").trim().toLowerCase();
  if (u !== "g" && u !== "ml") return formatAmountRu(canonicalAmount, false) + (u ? ` ${localizeUnit(u)}` : "");
  return `${formatAmountRu(canonicalAmount, false)} ${u === "ml" ? "мл" : "г"}`;
}

/** Склонение для «зубчик». */
export function pluralRuZubchik(n: number): string {
  const v = Math.abs(n);
  const mod10 = Math.floor(v) % 10;
  const mod100 = Math.floor(v) % 100;
  if (mod100 >= 11 && mod100 <= 14) return "зубчиков";
  if (mod10 === 1) return "зубчик";
  if (mod10 >= 2 && mod10 <= 4) return "зубчика";
  return "зубчиков";
}

const HOUSEHOLD_AFTER_DASH =
  /(\d+[.,]?\d*)\s*(зубчик|зубчика|зубчиков|ст\.\s*л\.?|ст\.л\.?|ч\.\s*л\.?|ч\.л\.?|шт\.?|штук|штуки)(?=\s*$|[\s,;.)])/i;

export function tryParseHouseholdFromText(displayText: string, name: string): { amount: number; unitRaw: string } | null {
  const d = (displayText ?? "").trim();
  if (!d) return null;
  const dash = d.indexOf("—");
  const tail = dash >= 0 ? d.slice(dash + 1).trim() : d;
  const m = tail.match(HOUSEHOLD_AFTER_DASH);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  let unitRaw = m[2].trim().toLowerCase();
  if (/^ст/.test(unitRaw)) unitRaw = "ст. л.";
  else if (/^ч/.test(unitRaw)) unitRaw = "ч. л.";
  else if (/^шт|^штук/.test(unitRaw)) unitRaw = "шт.";
  else if (/зубчик/.test(unitRaw)) unitRaw = "зубчик";
  return { amount, unitRaw };
}

/** Насколько вычисленное количество по эталону близко к канону (доля). */
function withinTolerance(computed: number, canonical: number, maxRelDiff: number): boolean {
  if (!Number.isFinite(computed) || computed <= 0 || !Number.isFinite(canonical) || canonical <= 0) return false;
  return Math.abs(computed - canonical) / canonical <= maxRelDiff;
}

const G_PER_CLOVE = 5;
const G_PER_ONION = 90;
const G_PER_TBSP_OIL = 17;
const G_PER_TSP = 5;
const ML_PER_TBSP = 15;
const ML_PER_TSP = 5;

/**
 * Для сохранения в БД: заполняет display-слой и measurement_mode.
 * Не выдумывает dual без уверенности — иначе canonical_only.
 */
export function enrichIngredientMeasurementForSave(ing: IngredientMeasurementInput): {
  display_amount: number | null;
  display_unit: string | null;
  display_quantity_text: string | null;
  measurement_mode: MeasurementMode;
  display_text: string | null;
} {
  const name = (ing.name ?? "").trim();
  const displayTextIn = (ing.display_text ?? "").trim();
  const ca = ing.canonical_amount != null ? Number(ing.canonical_amount) : NaN;
  const cu = (ing.canonical_unit ?? "").trim().toLowerCase();

  if (
    ing.measurement_mode === "dual" &&
    ing.display_amount != null &&
    Number.isFinite(Number(ing.display_amount)) &&
    (ing.display_unit ?? "").trim() !== ""
  ) {
    const da = Number(ing.display_amount);
    const du = (ing.display_unit ?? "").trim();
    const qtyText = (ing.display_quantity_text ?? "").trim();
    if (Number.isFinite(ca) && (cu === "g" || cu === "ml")) {
      const canonPart = formatCanonicalSuffix(ca, cu);
      const left = qtyText ? qtyText : `${formatAmountRu(da, du.toLowerCase().includes("зубчик"))} ${localizeUnit(du)}`.trim();
      const line = name ? `${name} — ${left} = ${canonPart}` : `${left} = ${canonPart}`;
      return {
        display_amount: da,
        display_unit: du,
        display_quantity_text: qtyText || null,
        measurement_mode: "dual",
        display_text: line,
      };
    }
  }

  const category =
    ing.category && String(ing.category).trim()
      ? String(ing.category).trim().toLowerCase()
      : inferDbProductCategoryFromText(normalizeIngredientTextForCategoryMatch(name, displayTextIn));

  const parsedHousehold = tryParseHouseholdFromText(displayTextIn, name);

  const verifyDual = (
    displayAmount: number,
    displayUnit: string,
    displayQuantityText: string | null,
  ): { display_amount: number; display_unit: string; display_quantity_text: string | null; measurement_mode: MeasurementMode; display_text: string } | null => {
    if (!name) return null;
    let expected = 0;
    const u = displayUnit.toLowerCase();
    if (u.includes("зубчик")) {
      if (cu !== "g") return null;
      expected = displayAmount * G_PER_CLOVE;
      if (!withinTolerance(expected, ca, 0.45)) return null;
    } else if (u.includes("ст. л.") || u === "ст. л.") {
      if (cu === "g" && /масло|оливк|подсолнечн|растительн|сливочн/i.test(name + " " + displayTextIn)) {
        expected = displayAmount * G_PER_TBSP_OIL;
        if (!withinTolerance(expected, ca, 0.4)) return null;
      } else if (cu === "ml") {
        expected = displayAmount * ML_PER_TBSP;
        if (!withinTolerance(expected, ca, 0.4)) return null;
      } else return null;
    } else if (u.includes("ч. л.")) {
      if (cu === "g") {
        expected = displayAmount * G_PER_TSP;
        if (!withinTolerance(expected, ca, 0.5)) return null;
      } else if (cu === "ml") {
        expected = displayAmount * ML_PER_TSP;
        if (!withinTolerance(expected, ca, 0.5)) return null;
      } else return null;
    } else if (u.includes("шт") || u.startsWith("шт")) {
      if (cu !== "g") return null;
      if (!shouldUseDualMeasurement({ ...ing, category })) return null;
      expected = displayAmount * G_PER_ONION;
      if (/лук/i.test(name + displayTextIn)) {
        if (!withinTolerance(expected, ca, 0.55)) return null;
      } else {
        const avg =
          /картоф/i.test(name) ? 95
          : /морков/i.test(name) ? 75
          : /яблок/i.test(name) ? 140
          : /банан/i.test(name) ? 105
          : /лимон/i.test(name) ? 95
          : /помидор|томат/i.test(name) ? 100
          : /огурц/i.test(name) ? 100
          : /тыкв/i.test(name) ? 200
          : null;
        if (avg == null || !withinTolerance(displayAmount * avg, ca, 0.55)) return null;
      }
    } else return null;

    const canonStr = formatCanonicalSuffix(ca, cu);
    const du = displayQuantityText
      ? displayQuantityText.trim()
      : u.includes("зубчик")
        ? `${formatAmountRu(displayAmount, true)} ${pluralRuZubchik(displayAmount)}`
        : `${formatAmountRu(displayAmount, isPieceUnit(displayUnit))} ${displayUnit}`.trim();
    const line = `${name} — ${du} = ${canonStr}`;
    return {
      display_amount: displayAmount,
      display_unit: displayUnit,
      display_quantity_text: displayQuantityText,
      measurement_mode: "dual",
      display_text: line,
    };
  };

  if (parsedHousehold && shouldUseDualMeasurement({ ...ing, category })) {
    const unitNorm = parsedHousehold.unitRaw.includes("зубчик")
      ? "зубчик"
      : parsedHousehold.unitRaw;
    const v = verifyDual(parsedHousehold.amount, unitNorm, null);
    if (v) {
      return {
        display_amount: v.display_amount,
        display_unit: v.display_unit,
        display_quantity_text: v.display_quantity_text,
        measurement_mode: v.measurement_mode,
        display_text: v.display_text,
      };
    }
  }

  if (shouldUseDualMeasurement({ ...ing, category }) && cu === "g" && Number.isFinite(ca)) {
    if (/(чеснок|чесноч)/i.test(name + " " + displayTextIn)) {
      const cloves = Math.max(1, Math.round(ca / G_PER_CLOVE));
      const v = verifyDual(cloves, "зубчик", null);
      if (v) return v;
    }
    if (/(^|\s)лук(\s|$)|репчат/i.test(name + displayTextIn)) {
      const bulbs = Math.max(0.25, Math.round((ca / G_PER_ONION) * 4) / 4);
      const v = verifyDual(bulbs, "шт.", null);
      if (v) return v;
    }
    if (category === "fats" && /масло|оливк|подсолнечн|растительн|сливочн/i.test(name + displayTextIn)) {
      const tbsp = Math.max(0.25, Math.round((ca / G_PER_TBSP_OIL) * 4) / 4);
      const v = verifyDual(tbsp, "ст. л.", null);
      if (v) return v;
    }
  }

  return {
    display_amount: null,
    display_unit: null,
    display_quantity_text: null,
    measurement_mode: "canonical_only",
    display_text: displayTextIn || null,
  };
}

/**
 * Единая строка отображения (карточка рецепта, чипы, масштаб порций).
 * Масштабирование: только canonical_amount и (при dual) display_amount; не парсим display_text.
 */
export function formatIngredientMeasurement(
  ing: IngredientMeasurementInput,
  options?: { servingMultiplier?: number },
): string {
  let mult = options?.servingMultiplier ?? 1;
  if (mult <= 0 || !Number.isFinite(mult)) mult = 1;

  const name = (ing.name ?? "").trim();
  const note = typeof ing.note === "string" ? ing.note.trim() : "";
  if (note) return name ? `${name} — ${note}` : note;

  const mode = (ing.measurement_mode ?? "canonical_only") as MeasurementMode;
  const dt = (ing.display_text ?? "").trim();
  const ca0 = ing.canonical_amount != null ? Number(ing.canonical_amount) : null;
  const cu = (ing.canonical_unit ?? "").trim();

  if (/по вкусу|для подачи/i.test(dt)) {
    return name ? (dt.includes("—") ? dt : `${name} — ${dt}`) : dt;
  }

  if (mode === "dual" && ca0 != null && Number.isFinite(ca0) && (cu === "g" || cu === "ml")) {
    const scaledCanon = ca0 * mult;
    const canonPart = formatCanonicalSuffix(scaledCanon, cu);

    const qtyText = (ing.display_quantity_text ?? "").trim();
    if (qtyText) {
      return `${name} — ${qtyText} = ${canonPart}`;
    }

    const da0 = ing.display_amount != null ? Number(ing.display_amount) : null;
    const du = (ing.display_unit ?? "").trim();
    if (da0 != null && Number.isFinite(da0) && du) {
      const scaledDa = da0 * mult;
      let left: string;
      if (du.toLowerCase().includes("зубчик")) {
        const rounded = Math.max(1, Math.round(scaledDa * 10) / 10);
        left = `${formatAmountRu(rounded, true)} ${pluralRuZubchik(rounded)}`;
      } else {
        left = `${formatAmountRu(scaledDa, isPieceUnit(du))} ${localizeUnit(du)}`.trim();
      }
      return `${name} — ${left} = ${canonPart}`;
    }

    if (dt.length >= 3 && mult === 1) {
      return dt.includes("—") || !name ? dt : `${name} — ${dt.replace(new RegExp(`^${escapeRe(name)}\\s*—\\s*`, "i"), "")}`;
    }
  }

  if (mode === "display_only" && dt.length >= 3) {
    return dt.includes("—") || !name ? dt : `${name} — ${dt}`;
  }

  if (ca0 != null && Number.isFinite(ca0) && (cu === "g" || cu === "ml")) {
    const scaled = ca0 * mult;
    const suffix = formatCanonicalSuffix(scaled, cu);
    return name ? `${name} — ${suffix}` : suffix;
  }

  const amount = ing.amount != null ? Number(ing.amount) : null;
  const unit = (ing.unit ?? "").trim();
  if (amount != null && Number.isFinite(amount) && unit) {
    const scaled = amount * mult;
    const suffix = `${formatAmountRu(scaled, isPieceUnit(unit))} ${localizeUnit(unit)}`.trim();
    return name ? `${name} — ${suffix}` : suffix;
  }

  if (dt.length >= 3) {
    if (mult === 1) {
      if (name && !dt.toLowerCase().includes(name.toLowerCase())) return `${name} — ${dt}`;
      return dt;
    }
    if (ca0 == null && amount != null && unit) {
      const scaled = amount * mult;
      return name ? `${name} — ${formatAmountRu(scaled, isPieceUnit(unit))} ${localizeUnit(unit)}` : `${formatAmountRu(scaled, isPieceUnit(unit))} ${localizeUnit(unit)}`;
    }
    return dt;
  }

  if (name) return name;
  return "Ингредиент";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
