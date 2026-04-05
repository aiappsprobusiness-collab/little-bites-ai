/**
 * Двойной формат ингредиентов: UX-слой поверх canonical (g/ml).
 * Математика порций — только по canonical_amount / canonical_unit.
 * Решение dual vs canonical_only — в `ingredientMeasurementEngine` + quality gate.
 */

import {
  parseExplicitHouseholdFromText,
  resolveHouseholdCandidateForSave,
  validatePersistedDualMeasurement,
} from "./ingredientMeasurementEngine.ts";
import type { ResolvedHouseholdCandidate } from "./ingredientMeasurementEngine.ts";
import { scaledHouseholdStaysReadableForDual } from "./ingredientMeasurementQuality.ts";

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

/**
 * Есть ли кандидат на dual, проходящий универсальный pipeline + quality gate
 * (не whitelist продуктов).
 */
export function shouldUseDualMeasurement(input: IngredientMeasurementInput): boolean {
  const name = (input.name ?? "").trim();
  const displayText = (input.display_text ?? "").trim();
  const ca = input.canonical_amount != null ? Number(input.canonical_amount) : NaN;
  const cu = (input.canonical_unit ?? "").trim();
  if (!name || !Number.isFinite(ca) || ca <= 0) return false;
  if (cu !== "g" && cu !== "ml") return false;
  return (
    resolveHouseholdCandidateForSave({
      name,
      display_text: displayText,
      canonical_amount: ca,
      canonical_unit: cu,
      category: input.category,
    }) != null
  );
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

/** Локализация единицы для UI (г/мл/шт./ч. л./…). */
export function localizeIngredientUnitRu(u: string): string {
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
  const ru = localizeIngredientUnitRu(u);
  return ru === "шт." || /^шт/i.test(u.trim());
}

export function formatCanonicalSuffix(canonicalAmount: number, canonicalUnit: string | null | undefined): string {
  const u = (canonicalUnit ?? "").trim().toLowerCase();
  if (u !== "g" && u !== "ml") return formatAmountRu(canonicalAmount, false) + (u ? ` ${localizeIngredientUnitRu(u)}` : "");
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

export function tryParseHouseholdFromText(
  displayText: string,
  _name?: string,
): { amount: number; unitRaw: string } | null {
  const p = parseExplicitHouseholdFromText(displayText);
  if (!p) return null;
  return { amount: p.amount, unitRaw: p.unitRaw };
}

function buildDualQuantityLeft(c: ResolvedHouseholdCandidate): string {
  const q = c.displayQuantityText?.trim();
  if (q) return q;
  const da = c.displayAmount;
  const du = c.displayUnit;
  if (du.toLowerCase().includes("зубчик")) {
    return `${formatAmountRu(da, true)} ${pluralRuZubchik(da)}`.trim();
  }
  return `${formatAmountRu(da, isPieceUnit(du))} ${localizeIngredientUnitRu(du)}`.trim();
}

/**
 * Для сохранения в БД: заполняет display-слой и measurement_mode.
 * Dual только если кандидат проходит engine + quality gate; иначе canonical_only.
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
    (ing.display_unit ?? "").trim() !== "" &&
    Number.isFinite(ca) &&
    (cu === "g" || cu === "ml") &&
    name
  ) {
    const da = Number(ing.display_amount);
    const du = (ing.display_unit ?? "").trim();
    if (
      validatePersistedDualMeasurement({
        name,
        display_text: displayTextIn,
        display_amount: da,
        display_unit: du,
        canonical_amount: ca,
        canonical_unit: cu,
        category: ing.category,
      })
    ) {
      const qtyText = (ing.display_quantity_text ?? "").trim();
      const canonPart = formatCanonicalSuffix(ca, cu);
      const left = qtyText
        ? qtyText
        : du.toLowerCase().includes("зубчик")
          ? `${formatAmountRu(da, true)} ${pluralRuZubchik(da)}`
          : `${formatAmountRu(da, isPieceUnit(du))} ${localizeIngredientUnitRu(du)}`.trim();
      const line = `${name} — ${left} = ${canonPart}`;
      return {
        display_amount: da,
        display_unit: du,
        display_quantity_text: qtyText || null,
        measurement_mode: "dual",
        display_text: line,
      };
    }
  }

  if (!name || !Number.isFinite(ca) || ca <= 0 || (cu !== "g" && cu !== "ml")) {
    return {
      display_amount: null,
      display_unit: null,
      display_quantity_text: null,
      measurement_mode: "canonical_only",
      display_text: displayTextIn || null,
    };
  }

  const candidate = resolveHouseholdCandidateForSave({
    name,
    display_text: displayTextIn,
    canonical_amount: ca,
    canonical_unit: cu,
    category: ing.category,
  });

  if (candidate) {
    const canonPart = formatCanonicalSuffix(ca, cu);
    const left = buildDualQuantityLeft(candidate);
    const line = `${name} — ${left} = ${canonPart}`;
    return {
      display_amount: candidate.displayAmount,
      display_unit: candidate.displayUnit,
      display_quantity_text: candidate.displayQuantityText,
      measurement_mode: "dual",
      display_text: line,
    };
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
    const da0 = ing.display_amount != null ? Number(ing.display_amount) : null;
    const du = (ing.display_unit ?? "").trim();

    const householdReadableScaled =
      da0 != null && Number.isFinite(da0) && du ? scaledHouseholdStaysReadableForDual(da0, mult) : false;

    if (mult !== 1 && !householdReadableScaled) {
      return name ? `${name} — ${canonPart}` : canonPart;
    }

    if (mult === 1 && qtyText) {
      return `${name} — ${qtyText} = ${canonPart}`;
    }

    if (da0 != null && Number.isFinite(da0) && du) {
      const scaledDa = da0 * mult;
      let left: string;
      if (du.toLowerCase().includes("зубчик")) {
        const rounded = Math.max(1, Math.round(scaledDa * 10) / 10);
        left = `${formatAmountRu(rounded, true)} ${pluralRuZubchik(rounded)}`;
      } else {
        left = `${formatAmountRu(scaledDa, isPieceUnit(du))} ${localizeIngredientUnitRu(du)}`.trim();
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
    const suffix = `${formatAmountRu(scaled, isPieceUnit(unit))} ${localizeIngredientUnitRu(unit)}`.trim();
    return name ? `${name} — ${suffix}` : suffix;
  }

  if (dt.length >= 3) {
    if (mult === 1) {
      if (name && !dt.toLowerCase().includes(name.toLowerCase())) return `${name} — ${dt}`;
      return dt;
    }
    if (ca0 == null && amount != null && unit) {
      const scaled = amount * mult;
      return name
        ? `${name} — ${formatAmountRu(scaled, isPieceUnit(unit))} ${localizeIngredientUnitRu(unit)}`
        : `${formatAmountRu(scaled, isPieceUnit(unit))} ${localizeIngredientUnitRu(unit)}`;
    }
    return dt;
  }

  if (name) return name;
  return "Ингредиент";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
