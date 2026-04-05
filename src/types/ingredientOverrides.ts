/**
 * Типы и хелперы для ingredient_overrides в meal_plans_v2.meals[mealType].
 * Overrides применяются только к слоту плана (planned_date + mealType + member), не к рецепту в БД.
 * Порядок: base ingredients → scale by slot servings → apply overrides (swap/skip/reduce).
 */

import type { IngredientItem } from "./recipe";
import { ingredientDisplayLabel, scaleIngredientDisplay } from "./recipe";
import { formatIngredientAmountForDisplay } from "@/utils/formatIngredientAmount";

export type IngredientOverrideAction = "swap" | "skip" | "reduce";

export interface IngredientOverrideFromTo {
  name: string;
  amount?: number;
  unit?: string;
  canonical_name?: string;
  canonical_amount?: number;
  canonical_unit?: string;
}

export interface IngredientOverrideEntry {
  key: string;
  action: IngredientOverrideAction;
  from: IngredientOverrideFromTo;
  to?: IngredientOverrideFromTo;
  ratio?: number;
  updated_at: string;
}

/** Стабильный ключ ингредиента: приоритет id, иначе normalized(name+unit). */
export function ingredientKey(
  ing: { name?: string; id?: string } & Record<string, unknown>,
  index: number
): string {
  const id = (ing as { id?: string }).id;
  if (typeof id === "string" && id.trim()) return id;
  const name = (ing.name ?? "").trim().toLowerCase();
  const unit = String((ing as { unit?: string }).unit ?? "").trim().toLowerCase();
  const raw = `${name}|${unit}`;
  return raw ? `${index}_${raw}` : `idx_${index}`;
}

/** Нормализовать имя для поиска в словаре замен. */
export function normalizeNameForKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Применить overrides к списку ингредиентов с учётом масштаба порций.
 * Логика: base → scale by servingMultiplier → apply overrides.
 * Возвращает: массив для отображения (skip исключён) + map index → display label для чипов.
 */
export function applyIngredientOverrides(
  baseIngredients: IngredientItem[],
  overrides: IngredientOverrideEntry[],
  servingMultiplier: number,
  servingsBase: number
): { displayItems: IngredientItem[]; displayLabels: Record<number, string>; keysByIndex: string[]; keysForDisplayItems: string[] } {
  const keysByIndex = baseIngredients.map((ing, i) => ingredientKey(ing as { name?: string } & Record<string, unknown>, i));
  const overrideByKey = new Map(overrides.map((o) => [o.key, o]));

  const displayItems: IngredientItem[] = [];
  const keysForDisplayItems: string[] = [];
  const displayLabels: Record<number, string> = {};
  let outIndex = 0;

  for (let i = 0; i < baseIngredients.length; i++) {
    const ing = baseIngredients[i];
    const key = keysByIndex[i];
    const override = overrideByKey.get(key);

    if (override?.action === "skip") {
      if (import.meta.env.DEV) console.debug("[applyOverride] applyOverride", { key, action: "skip" });
      continue; // not pushed to displayItems, so no key added to keysForDisplayItems
    }

    const scale = servingMultiplier;
    let scaledIng: IngredientItem = { ...ing };
    if (scale !== 1) {
      const name = (ing.name ?? "").trim();
      const amount = (ing as { amount?: number }).amount;
      const unit = (ing as { unit?: string }).unit;
      const canonical_amount = (ing as { canonical_amount?: number }).canonical_amount;
      const canonical_unit = (ing as { canonical_unit?: string }).canonical_unit;
      const measurement_mode = (ing as { measurement_mode?: string }).measurement_mode;
      const display_amount = (ing as { display_amount?: number }).display_amount;
      const display_quantity_text = (ing as { display_quantity_text?: string }).display_quantity_text;
      if (canonical_amount != null && canonical_unit) {
        const scaledCanon = Math.round(canonical_amount * scale * 10) / 10;
        if (
          measurement_mode === "dual" &&
          display_amount != null &&
          Number.isFinite(display_amount) &&
          !display_quantity_text?.trim()
        ) {
          const scaledDa = Math.round(display_amount * scale * 10) / 10;
          scaledIng = {
            ...ing,
            canonical_amount: scaledCanon,
            amount: scaledCanon,
            unit: canonical_unit,
            display_amount: scaledDa,
            measurement_mode: "dual",
          };
        } else if (measurement_mode === "dual" && display_quantity_text?.trim()) {
          scaledIng = {
            ...ing,
            canonical_amount: scaledCanon,
            amount: scaledCanon,
            unit: canonical_unit,
            measurement_mode: "dual",
          };
        } else {
          const suffix = formatIngredientAmountForDisplay(scaledCanon, canonical_unit);
          scaledIng = {
            ...ing,
            canonical_amount: scaledCanon,
            amount: scaledCanon,
            unit: canonical_unit,
            display_text: name ? `${name} — ${suffix}` : suffix,
          };
        }
      } else if (amount != null) {
        const scaledAmount = Math.round(amount * scale * 10) / 10;
        const u = unit ?? "";
        const suffix = formatIngredientAmountForDisplay(scaledAmount, u || null);
        scaledIng = {
          ...ing,
          amount: scaledAmount,
          unit: unit ?? undefined,
          display_text: name ? `${name} — ${suffix}` : suffix,
        };
      } else {
        const scaledLabel = scaleIngredientDisplay(ing as IngredientItem, scale);
        if (scaledLabel !== ingredientDisplayLabel(ing as IngredientItem)) {
          scaledIng = { ...ing, display_text: scaledLabel };
        }
      }
    }

    if (override?.action === "swap" && override.to) {
      const to = override.to;
      const scaledToAmount =
        to.canonical_amount != null && to.canonical_unit
          ? Math.round(to.canonical_amount * scale * 10) / 10
          : to.amount != null
            ? Math.round(to.amount * scale * 10) / 10
            : undefined;
      const displayName = to.name ?? ing.name;
      const suffix =
        scaledToAmount != null && (to.canonical_unit ?? to.unit)
          ? ` — ${formatIngredientAmountForDisplay(scaledToAmount, to.canonical_unit ?? to.unit ?? "")}`
          : "";
      displayItems.push({
        ...scaledIng,
        name: displayName,
        display_text: `${displayName}${suffix}`.trim() || displayName,
        canonical_name: to.canonical_name ?? to.name,
        canonical_amount: scaledToAmount ?? (to.canonical_amount != null ? to.canonical_amount * scale : undefined),
        canonical_unit: (to.canonical_unit as "g" | "ml" | undefined) ?? (scaledIng as IngredientItem).canonical_unit,
      });
      displayLabels[outIndex] = `${displayName}${suffix}`.trim() || displayName;
      keysForDisplayItems.push(key);
    } else if (override?.action === "reduce" && override.ratio != null) {
      const ratio = Math.min(1, Math.max(0, override.ratio));
      const ingWithAmount = scaledIng as IngredientItem & { amount?: number; canonical_amount?: number };
      const amt = ingWithAmount.canonical_amount ?? ingWithAmount.amount;
      const unit = (ingWithAmount.canonical_unit ?? ingWithAmount.unit) ?? "";
      const reduced = amt != null ? Math.round(amt * ratio * 10) / 10 : undefined;
      const displayText =
        reduced != null && unit
          ? `${ingWithAmount.name ?? ""} — ${formatIngredientAmountForDisplay(reduced, unit)}`
          : reduced != null
            ? `${ingWithAmount.name ?? ""} — ${formatIngredientAmountForDisplay(reduced, null)}`
            : ingredientDisplayLabel(scaledIng);
      displayItems.push({
        ...scaledIng,
        amount: reduced ?? scaledIng.amount,
        canonical_amount: reduced ?? (scaledIng as { canonical_amount?: number }).canonical_amount,
        display_text: displayText,
      });
      displayLabels[outIndex] = displayText;
      keysForDisplayItems.push(key);
    } else {
      displayItems.push(scaledIng);
      displayLabels[outIndex] = ingredientDisplayLabel(scaledIng);
      keysForDisplayItems.push(key);
    }
    outIndex++;
  }

  if (import.meta.env.DEV && overrides.length > 0) {
    const missingKeyCount = overrides.filter((o) => !keysByIndex.includes(o.key)).length;
    console.debug("[applyOverride] mergeOverridesCount=", overrides.length, "missingKeyCount=", missingKeyCount);
    overrides.forEach((o) => {
      if (keysByIndex.includes(o.key)) console.debug("[applyOverride] applyOverride", { key: o.key, action: o.action });
    });
  }

  return { displayItems, displayLabels, keysByIndex, keysForDisplayItems };
}

/**
 * Построить from-объект из ингредиента рецепта (для сохранения в override).
 */
export function buildOverrideFrom(ing: IngredientItem, key: string): IngredientOverrideFromTo {
  return {
    name: ing.name ?? "",
    amount: (ing as { amount?: number }).amount,
    unit: (ing as { unit?: string }).unit,
    canonical_name: (ing as { canonical_name?: string }).canonical_name ?? ing.name ?? undefined,
    canonical_amount: (ing as { canonical_amount?: number }).canonical_amount ?? undefined,
    canonical_unit: (ing as { canonical_unit?: string }).canonical_unit ?? undefined,
  };
}

/**
 * Построить to-объект для swap (из выбранного варианта замены).
 */
export function buildOverrideTo(
  optionName: string,
  fromIng: IngredientItem
): IngredientOverrideFromTo {
  const amount = (fromIng as { amount?: number }).amount;
  const unit = (fromIng as { unit?: string }).unit;
  const canonical_amount = (fromIng as { canonical_amount?: number }).canonical_amount;
  const canonical_unit = (fromIng as { canonical_unit?: string }).canonical_unit;
  return {
    name: optionName.trim(),
    amount,
    unit,
    canonical_name: optionName.trim().toLowerCase(),
    canonical_amount,
    canonical_unit: canonical_unit ?? undefined,
  };
}
