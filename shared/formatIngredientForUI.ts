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

/** Сухие специи/соль: канон в мл смысла для покупки мало — показываем ложки, если есть бытовой слой или малый объём. */
function isLikelyDrySpiceOrSaltName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return (
    n.includes("соль") ||
    n.includes("перец") ||
    n.includes("паприк") ||
    n.includes("кориц") ||
    n.includes("куркум") ||
    n.includes("имбир") ||
    n.includes("мускат") ||
    n.includes("гвоздик") ||
    n.includes("лавров") ||
    n.includes("карри") ||
    n.includes("кмин") ||
    n.includes("зира") ||
    n.includes("зиры")
  );
}

function displayUnitLooksLikeSpoon(displayUnit: string): boolean {
  const u = displayUnit.trim().toLowerCase();
  return (
    u.includes("ч. л") ||
    u.includes("ч.л") ||
    u.includes("ст. л") ||
    u.includes("ст.л") ||
    /tsp|tbsp|ложк/i.test(u)
  );
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
    return `${formatAmountRu(scaledDa, true)} ${pluralRuZubchik(scaledDa)}`.trim();
  }
  return `${formatAmountRu(scaledDa, isPieceLikeDisplayUnit(du))} ${localizeIngredientUnitRu(du)}`.trim();
}

/** Правая часть для shopping: для специй с каноном в мл — ч. л. вместо мл. */
function formatShoppingCanonicalRight(caScaled: number, cu: string, ingredientName: string): string {
  const u = cu.trim().toLowerCase();
  if (u === "ml" && isLikelyDrySpiceOrSaltName(ingredientName)) {
    const tsp = caScaled / 5;
    return `${formatAmountRu(tsp, false)} ч. л.`;
  }
  return formatCanonicalSuffix(caScaled, cu);
}

export type FormatIngredientForUIOptions = {
  /**
   * Множитель порций для числовых слоёв (canonical g/ml, display_amount, legacy amount+unit).
   * Обычно `servingsSelected / servings_base` (канон на 1 порцию при base=1).
   */
  servingMultiplier?: number;
};

export function formatIngredientForUI(
  ingredient: IngredientMeasurementInput,
  context: IngredientUIContext,
  options?: FormatIngredientForUIOptions,
): string {
  let mult = options?.servingMultiplier ?? 1;
  if (mult <= 0 || !Number.isFinite(mult)) mult = 1;

  const mode = (ingredient.measurement_mode ?? "canonical_only").trim().toLowerCase();
  const name = (ingredient.name ?? "").trim();

  if (mode === "dual") {
    const ca0 = ingredient.canonical_amount != null ? Number(ingredient.canonical_amount) : null;
    const cu = (ingredient.canonical_unit ?? "").trim();
    const duRaw = (ingredient.display_unit ?? "").trim();

    if (context === "recipe") {
      const qtyText = mult === 1 ? (ingredient.display_quantity_text ?? "").trim() : "";
      const leftFromQty = qtyText || null;
      const leftFromAmount = formatDualLeftShoppingFragment(ingredient, mult);
      const leftPart = leftFromQty ?? leftFromAmount;

      const suppressMlRight =
        cu === "ml" && isLikelyDrySpiceOrSaltName(name) && (displayUnitLooksLikeSpoon(duRaw) || (ca0 != null && ca0 * mult <= 30));

      let rightPart: string | null = null;
      if (ca0 != null && Number.isFinite(ca0) && (cu === "g" || cu === "ml")) {
        const scaled = ca0 * mult;
        if (cu === "ml" && suppressMlRight) {
          rightPart = null;
        } else {
          rightPart = formatCanonicalSuffix(scaled, cu);
        }
      }

      if (leftPart && rightPart) return `${leftPart} = ${rightPart}`;
      if (leftPart) return leftPart;
      if (rightPart) return rightPart;

      if (cu === "ml" && suppressMlRight && ca0 != null && Number.isFinite(ca0)) {
        const tsp = (ca0 * mult) / 5;
        return `${formatAmountRu(tsp, false)} ч. л.`;
      }

      const dt = (ingredient.display_text ?? "").trim();
      return dt ? stripNamePrefixFromDisplayText(name, dt) : "";
    }

    const qty = (ingredient.display_quantity_text ?? "").trim();
    if (qty && mult === 1) return qty;
    const dt = (ingredient.display_text ?? "").trim();
    if (dt && mult === 1) return stripNamePrefixFromDisplayText(name, dt) || dt;

    const left = formatDualLeftShoppingFragment(ingredient, mult);
    if (left && ca0 != null && Number.isFinite(ca0) && (cu === "g" || cu === "ml")) {
      const right = formatShoppingCanonicalRight(ca0 * mult, cu, name);
      return `${left} ≈ ${right}`;
    }
    return (ingredient.display_text ?? "").trim();
  }

  const dtRaw = (ingredient.display_text ?? "").trim();
  if (dtRaw) {
    return stripNamePrefixFromDisplayText(name, dtRaw) || dtRaw;
  }

  const ca0co = ingredient.canonical_amount != null ? Number(ingredient.canonical_amount) : null;
  const cu2 = (ingredient.canonical_unit ?? "").trim();
  if (ca0co != null && Number.isFinite(ca0co) && (cu2 === "g" || cu2 === "ml")) {
    if (cu2 === "ml" && isLikelyDrySpiceOrSaltName(name) && ca0co * mult <= 30) {
      return `${formatAmountRu((ca0co * mult) / 5, false)} ч. л.`;
    }
    return formatCanonicalSuffix(ca0co * mult, cu2);
  }

  const amount = ingredient.amount != null ? Number(ingredient.amount) : null;
  const unit = (ingredient.unit ?? "").trim();
  if (amount != null && Number.isFinite(amount) && unit) {
    return `${formatAmountRu(amount * mult, isPieceLikeDisplayUnit(unit))} ${localizeIngredientUnitRu(unit)}`.trim();
  }

  return name || "Ингредиент";
}
