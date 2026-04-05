/**
 * Единое отображение ингредиента в UI (карточка рецепта vs список покупок).
 * Не меняет БД и генерацию — только текст для экрана.
 */

import type { IngredientMeasurementInput } from "./ingredientMeasurementDisplay.ts";
import {
  formatAmountRu,
  formatCanonicalSuffix,
  localizeIngredientUnitRu,
  pluralRuZubchik,
} from "./ingredientMeasurementDisplay.ts";

export type IngredientUIContext = "recipe" | "shopping";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPieceLikeDisplayUnit(u: string): boolean {
  const ru = localizeIngredientUnitRu(u);
  return ru === "шт." || /^шт/i.test(u.trim());
}

/** Убрать префикс «Название —» из display_text, если он совпадает с name. */
function stripNamePrefixFromDisplayText(name: string, displayText: string): string {
  const n = name.trim();
  const dt = displayText.trim();
  if (!n || !dt) return dt;
  const re = new RegExp(`^${escapeRe(n)}\\s*—\\s*`, "i");
  if (re.test(dt)) return dt.replace(re, "").trim();
  return dt;
}

function formatDualLeftShoppingFragment(ing: IngredientMeasurementInput, mult: number): string | null {
  const da0 = ing.display_amount != null ? Number(ing.display_amount) : null;
  const du = (ing.display_unit ?? "").trim();
  if (da0 == null || !Number.isFinite(da0) || !du) return null;
  const scaledDa = da0 * mult;
  if (du.toLowerCase().includes("зубчик")) {
    const rounded = Math.max(1, Math.round(scaledDa * 10) / 10);
    return `${formatAmountRu(rounded, true)} ${pluralRuZubchik(rounded)}`.trim();
  }
  return `${formatAmountRu(scaledDa, isPieceLikeDisplayUnit(du))} ${localizeIngredientUnitRu(du)}`.trim();
}

export function formatIngredientForUI(
  ingredient: IngredientMeasurementInput,
  context: IngredientUIContext,
  options?: { servingMultiplier?: number },
): string {
  let mult = options?.servingMultiplier ?? 1;
  if (mult <= 0 || !Number.isFinite(mult)) mult = 1;

  const mode = (ingredient.measurement_mode ?? "canonical_only").trim().toLowerCase();
  const name = (ingredient.name ?? "").trim();

  if (mode === "dual") {
    const ca0 = ingredient.canonical_amount != null ? Number(ingredient.canonical_amount) : null;
    const cu = (ingredient.canonical_unit ?? "").trim();

    if (context === "recipe") {
      if (ca0 != null && Number.isFinite(ca0) && (cu === "g" || cu === "ml")) {
        return formatCanonicalSuffix(ca0 * mult, cu);
      }
      const dt = (ingredient.display_text ?? "").trim();
      return dt ? stripNamePrefixFromDisplayText(name, dt) : "";
    }

    const qty = (ingredient.display_quantity_text ?? "").trim();
    if (qty) return qty;
    const dt = (ingredient.display_text ?? "").trim();
    if (dt) return stripNamePrefixFromDisplayText(name, dt) || dt;

    const left = formatDualLeftShoppingFragment(ingredient, mult);
    if (left && ca0 != null && Number.isFinite(ca0) && (cu === "g" || cu === "ml")) {
      const right = formatCanonicalSuffix(ca0 * mult, cu);
      return `${left} ≈ ${right}`;
    }
    return (ingredient.display_text ?? "").trim();
  }

  const dtRaw = (ingredient.display_text ?? "").trim();
  if (dtRaw) {
    return stripNamePrefixFromDisplayText(name, dtRaw) || dtRaw;
  }

  const ca0 = ingredient.canonical_amount != null ? Number(ingredient.canonical_amount) : null;
  const cu2 = (ingredient.canonical_unit ?? "").trim();
  if (ca0 != null && Number.isFinite(ca0) && (cu2 === "g" || cu2 === "ml")) {
    return formatCanonicalSuffix(ca0 * mult, cu2);
  }

  const amount = ingredient.amount != null ? Number(ingredient.amount) : null;
  const unit = (ingredient.unit ?? "").trim();
  if (amount != null && Number.isFinite(amount) && unit) {
    return `${formatAmountRu(amount * mult, isPieceLikeDisplayUnit(unit))} ${localizeIngredientUnitRu(unit)}`.trim();
  }

  return name || "Ингредиент";
}
