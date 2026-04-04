/**
 * Решение safe canonical backfill для строк recipe_ingredients (без записи в БД).
 * Логика канона — `ingredientCanonicalResolve.ts` (как SQL ingredient_canonical).
 */

import {
  isValidStoredCanonicalPair,
  tryResolveCanonicalFromIngredientFields,
  type CanonicalResolutionSource,
} from "./ingredientCanonicalResolve.ts";

export type IngredientCanonicalRowInput = {
  name: string | null;
  amount: unknown;
  unit: string | null;
  display_text: string | null;
  canonical_amount: number | null;
  canonical_unit: string | null;
};

export type CanonicalBackfillPatch = {
  canonical_amount: number;
  canonical_unit: string;
};

export type CanonicalBackfillEvaluation =
  | { decision: "skip"; reason: string }
  | {
      decision: "update";
      reason: "parsed_from_amount_unit" | "parsed_from_display_text";
      patch: CanonicalBackfillPatch;
      resolutionSource: CanonicalResolutionSource;
    };

/**
 * @param onlyMissingCanonical если true — не чиним «битый» частичный канон, только полностью пустой.
 */
export function evaluateCanonicalIngredientRow(
  row: IngredientCanonicalRowInput,
  options?: { onlyMissingCanonical?: boolean },
): CanonicalBackfillEvaluation {
  const onlyMissing = options?.onlyMissingCanonical === true;
  const name = (row.name ?? "").trim();
  if (!name) {
    return { decision: "skip", reason: "missing_name" };
  }

  const hasAnyCanon = row.canonical_amount != null || row.canonical_unit != null;
  const bothValid = isValidStoredCanonicalPair(row.canonical_amount, row.canonical_unit);

  if (bothValid) {
    return { decision: "skip", reason: "already_has_valid_canonical" };
  }

  if (onlyMissing && hasAnyCanon) {
    return { decision: "skip", reason: "skipped_only_missing_partial_or_broken" };
  }

  const displayText = (row.display_text ?? "").trim() || null;
  const resolved = tryResolveCanonicalFromIngredientFields({
    amount: row.amount,
    unit: row.unit,
    display_text: displayText,
  });

  if (!resolved) {
    const amt = row.amount != null && String(row.amount).trim() !== "";
    const ut = row.unit != null && String(row.unit).trim() !== "";
    if (!amt && !ut && !displayText) {
      return { decision: "skip", reason: "missing_source_fields" };
    }
    if (amt || ut) {
      return { decision: "skip", reason: "unsupported_unit_or_failed_parse" };
    }
    if (displayText) {
      return { decision: "skip", reason: "failed_parse_display_text" };
    }
    return { decision: "skip", reason: "failed_parse" };
  }

  const reason =
    resolved.source === "amount_unit" ? "parsed_from_amount_unit" : "parsed_from_display_text";
  return {
    decision: "update",
    reason,
    resolutionSource: resolved.source,
    patch: { canonical_amount: resolved.canonical_amount, canonical_unit: resolved.canonical_unit },
  };
}
