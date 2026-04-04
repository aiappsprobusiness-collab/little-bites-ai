/**
 * Безопасная оценка: можно ли обновить строку recipe_ingredients до dual без дублирования логики engine/gate.
 * Использует enrichIngredientMeasurementForSave + validatePersistedDualMeasurement.
 */

import { enrichIngredientMeasurementForSave, type IngredientMeasurementInput } from "./ingredientMeasurementDisplay.ts";
import { validatePersistedDualMeasurement } from "./ingredientMeasurementEngine.ts";
import { isHumanReadableHouseholdQuantity } from "./ingredientMeasurementQuality.ts";

/** Поля строки ингредиента, достаточные для backfill / lazy-upgrade. */
export type IngredientRowForDualBackfill = {
  name: string | null;
  display_text: string | null;
  canonical_amount: number | null;
  canonical_unit: string | null;
  category: string | null;
  measurement_mode: string | null;
  display_amount: number | null;
  display_unit: string | null;
  display_quantity_text: string | null;
};

export type DualBackfillPatch = {
  display_amount: number | null;
  display_unit: string | null;
  display_quantity_text: string | null;
  measurement_mode: "dual";
  display_text: string | null;
};

export type DualBackfillEvaluation =
  | { decision: "skip"; reason: string }
  | { decision: "update"; reason: "updated_to_dual"; patch: DualBackfillPatch; priorMeasurementMode: string };

function trimMode(m: string | null | undefined): string {
  return (m ?? "canonical_only").trim().toLowerCase() || "canonical_only";
}

/** Свободная подпись без явного количества — не переписываем осторожно. */
export function looksLikeCustomIngredientDisplay(displayText: string): boolean {
  const d = displayText.trim();
  if (!d) return false;
  if (/по вкусу|для подачи/i.test(d)) return true;
  const structured =
    /[—–-]\s*\d+[.,]?\d*\s*(г|мл|g|ml)\b/i.test(d) ||
    /[—–-]\s*\d+[.,]?\d*\s*(ст\.?\s*л|ч\.?\s*л|зубчик|шт|штук|ломтик|стакан)/i.test(d);
  if (structured) return false;
  if (d.length > 100) return true;
  if (!/\d/.test(d)) return true;
  return false;
}

function rowToInput(row: IngredientRowForDualBackfill): IngredientMeasurementInput {
  return {
    name: row.name,
    display_text: row.display_text,
    canonical_amount: row.canonical_amount,
    canonical_unit: row.canonical_unit,
    category: row.category,
    measurement_mode: row.measurement_mode,
    display_amount: row.display_amount,
    display_unit: row.display_unit,
    display_quantity_text: row.display_quantity_text,
  };
}

/**
 * Решение safe backfill / lazy-upgrade для одной строки.
 * Не мутирует данные; вызывающий применяет patch в БД.
 */
export function evaluateDualMeasurementBackfill(row: IngredientRowForDualBackfill): DualBackfillEvaluation {
  const mode = trimMode(row.measurement_mode);
  const name = (row.name ?? "").trim();
  const displayText = (row.display_text ?? "").trim();
  const caRaw = row.canonical_amount;
  const ca = caRaw != null ? Number(caRaw) : NaN;
  const cu = (row.canonical_unit ?? "").trim().toLowerCase();

  if (mode === "display_only") {
    return { decision: "skip", reason: "display_only_mode" };
  }
  if (!name) {
    return { decision: "skip", reason: "missing_name" };
  }
  if (caRaw == null || !Number.isFinite(ca) || ca <= 0) {
    return { decision: "skip", reason: "missing_canonical" };
  }
  if (cu !== "g" && cu !== "ml") {
    return { decision: "skip", reason: "invalid_canonical_unit" };
  }

  if (/по вкусу|для подачи/i.test(displayText)) {
    return { decision: "skip", reason: "skipped_special_display" };
  }

  const da0 = row.display_amount != null ? Number(row.display_amount) : NaN;
  const du0 = (row.display_unit ?? "").trim();

  if (mode === "dual" && Number.isFinite(da0) && da0 > 0 && du0) {
    const ok = validatePersistedDualMeasurement({
      name,
      display_text: displayText,
      display_amount: da0,
      display_unit: du0,
      canonical_amount: ca,
      canonical_unit: cu,
      category: row.category,
    });
    if (ok && isHumanReadableHouseholdQuantity(Math.round(da0 * 1000) / 1000)) {
      return { decision: "skip", reason: "already_valid_dual" };
    }
  }

  if (mode === "canonical_only" && looksLikeCustomIngredientDisplay(displayText)) {
    return { decision: "skip", reason: "skipped_likely_custom_display_text" };
  }

  const enrichment = enrichIngredientMeasurementForSave(rowToInput(row));

  if (enrichment.measurement_mode !== "dual" || !enrichment.display_text) {
    if (mode === "dual") {
      return { decision: "skip", reason: "invalid_existing_dual_repair_failed" };
    }
    return { decision: "skip", reason: "no_dual_from_engine" };
  }

  const da = enrichment.display_amount != null ? Number(enrichment.display_amount) : NaN;
  if (!Number.isFinite(da) || da <= 0 || !isHumanReadableHouseholdQuantity(Math.round(da * 1000) / 1000)) {
    return { decision: "skip", reason: "skipped_due_to_unreadable_fraction" };
  }

  return {
    decision: "update",
    reason: "updated_to_dual",
    priorMeasurementMode: mode,
    patch: {
      display_amount: enrichment.display_amount,
      display_unit: enrichment.display_unit,
      display_quantity_text: enrichment.display_quantity_text,
      measurement_mode: "dual",
      display_text: enrichment.display_text,
    },
  };
}

/**
 * Тонкая точка для lazy-upgrade при открытии/сохранении рецепта: вернуть patch или объяснение отказа.
 */
export function maybeUpgradeIngredientMeasurement(row: IngredientRowForDualBackfill): {
  upgraded: boolean;
  reason: string;
  patch?: DualBackfillPatch;
} {
  const ev = evaluateDualMeasurementBackfill(row);
  if (ev.decision === "update") {
    return { upgraded: true, reason: ev.reason, patch: ev.patch };
  }
  return { upgraded: false, reason: ev.reason };
}
