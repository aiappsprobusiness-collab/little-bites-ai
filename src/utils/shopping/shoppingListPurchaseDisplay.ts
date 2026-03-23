/**
 * Purchase-friendly отображение строки shopping list поверх canonical aggregation.
 * Не меняет amount/unit в БД и merge_key; только текст для UI и копирования.
 */

import { applyYoToE } from "@/utils/shopping/canonicalShoppingIngredient";
import { SHOPPING_PCS_TO_GRAMS } from "@/utils/shopping/canonicalShoppingIngredient";
import { formatAmountForDisplay } from "@/utils/shopping/normalizeIngredientForShopping";
import { normalizeUnitForDisplay } from "@/utils/ingredientDisplay";

export type PurchaseDisplayMode =
  /** Только г/кг (крупы, сыр, большинство позиций по умолчанию). */
  | "weight_only"
  /** Только количество в шт., без ≈ (яйца). */
  | "count_only"
  /** N шт. ≈ M г — овощи/грибы с известным г/шт. */
  | "pcs_approx_grams"
  /** N зубчиков ≈ M г — чеснок. */
  | "cloves_approx_grams";

export interface PurchaseDisplayRule {
  mode: PurchaseDisplayMode;
  /** Для pcs_approx_grams: грамм на условную «штуку» (для обратного расчёта из суммы г). */
  gramsPerPiece?: number;
  gramsPerClove?: number;
}

/**
 * Канонический сегмент (часть merge_key до |) → правило отображения.
 * Только high-confidence; остальное — default formatter.
 */
const PURCHASE_RULES_BY_SEGMENT: Readonly<Record<string, PurchaseDisplayRule>> = {
  лук: { mode: "pcs_approx_grams", gramsPerPiece: SHOPPING_PCS_TO_GRAMS.лук },
  морковь: { mode: "pcs_approx_grams", gramsPerPiece: SHOPPING_PCS_TO_GRAMS.морковь },
  картофель: { mode: "pcs_approx_grams", gramsPerPiece: SHOPPING_PCS_TO_GRAMS.картофель },
  свекла: { mode: "pcs_approx_grams", gramsPerPiece: SHOPPING_PCS_TO_GRAMS.свекла },
  /** Пример из food apps: ~32 г/шт.; ориентир для покупки, не для агрегации. */
  шампиньоны: { mode: "pcs_approx_grams", gramsPerPiece: 32 },
  /** ~5 г/зубчик — только для purchase display. */
  чеснок: { mode: "cloves_approx_grams", gramsPerClove: 5 },
};

function canonicalSegmentFromMergeKey(mergeKey: string | null | undefined): string | null {
  if (mergeKey == null || String(mergeKey).trim() === "") return null;
  const part = String(mergeKey).split("|")[0]?.trim() ?? "";
  if (!part) return null;
  return applyYoToE(part).toLowerCase();
}

function totalGramsFromDisplay(amount: number | null, unitRaw: string | null): number | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  const u = (unitRaw ?? "").trim().toLowerCase();
  if (u === "г" || u === "g") return amount;
  if (u === "кг" || u === "kg") return amount * 1000;
  return null;
}

/** Округление «штук» для покупки: до ближайшего целого, минимум 1 при ненулевой массе. */
export function roundPurchasePieceCount(totalGrams: number, gramsPerPiece: number): number {
  if (!(gramsPerPiece > 0) || !Number.isFinite(totalGrams)) return 0;
  const n = Math.round(totalGrams / gramsPerPiece);
  if (totalGrams > 0 && n < 1) return 1;
  return n;
}

function pluralizeGarlicCloves(n: number): string {
  const abs = Math.abs(Math.round(n));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 14) return "зубчиков";
  if (mod10 === 1) return "зубчик";
  if (mod10 >= 2 && mod10 <= 4) return "зубчика";
  return "зубчиков";
}

export interface ShoppingListPurchaseLineInput {
  displayName: string;
  amount: number | null;
  unit: string | null;
  mergeKey: string | null | undefined;
  aggregationUnit: string | null | undefined;
}

export type ShoppingListPurchaseLineOptions = {
  /** В карточке — запятая; при копировании — длинное тире как в formatShoppingListForCopy. */
  delimiter?: ", " | " — ";
};

function defaultAmountLine(
  displayName: string,
  amount: number | null,
  unit: string | null,
  delimiter: ", " | " — "
): string {
  const a = amount != null && amount > 0 ? amount : null;
  const u = normalizeUnitForDisplay(unit);
  const amountStr = a != null ? formatAmountForDisplay(a, unit) : "";
  if (a != null && u) return `${displayName}${delimiter}${amountStr} ${u}`;
  if (a != null) return `${displayName}${delimiter}${amountStr}`;
  return displayName;
}

/**
 * Человекочитаемая строка позиции: dual display где настроено, иначе как раньше (кол-во + единица).
 */
export function formatShoppingListPurchaseLine(
  input: ShoppingListPurchaseLineInput,
  options?: ShoppingListPurchaseLineOptions
): string {
  const delimiter = options?.delimiter ?? ", ";
  const { displayName, amount, unit, mergeKey, aggregationUnit } = input;
  const name = displayName.trim() || displayName;
  const segment = canonicalSegmentFromMergeKey(mergeKey);
  const agg = (aggregationUnit ?? "").trim().toLowerCase();

  /** Яйца: только шт., без ≈ */
  if (segment === "яйца" && (agg === "pcs" || mergeKey?.endsWith("|pcs"))) {
    return defaultAmountLine(name, amount, unit, delimiter);
  }

  if (!segment) {
    return defaultAmountLine(name, amount, unit, delimiter);
  }

  const rule = PURCHASE_RULES_BY_SEGMENT[segment];
  const totalG = totalGramsFromDisplay(amount, unit);

  if (rule?.mode === "pcs_approx_grams" && rule.gramsPerPiece != null && totalG != null) {
    const pcs = roundPurchasePieceCount(totalG, rule.gramsPerPiece);
    const gRounded = Math.round(totalG);
    return `${name}${delimiter}${pcs} шт. ≈ ${gRounded} г`;
  }

  if (rule?.mode === "cloves_approx_grams" && rule.gramsPerClove != null && totalG != null) {
    const n = roundPurchasePieceCount(totalG, rule.gramsPerClove);
    const word = pluralizeGarlicCloves(n);
    const gRounded = Math.round(totalG);
    return `${name}${delimiter}${n} ${word} ≈ ${gRounded} г`;
  }

  return defaultAmountLine(name, amount, unit, delimiter);
}
