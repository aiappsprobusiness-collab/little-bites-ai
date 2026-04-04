/**
 * Канонизация количества ингредиента в духе SQL `normalize_ingredient_unit` + `ingredient_canonical`
 * (миграция `20260220120000_fix_ingredient_parsing_in_create_recipe_with_steps.sql`).
 * Без whitelist продуктов — только числа и единицы.
 */

/** Совпадает с CHECK recipe_ingredients_canonical_unit_check после миграции 20260220120000. */
export const ALLOWED_CANONICAL_UNITS = ["g", "kg", "ml", "l", "pcs", "tsp", "tbsp"] as const;
export type AllowedCanonicalUnit = (typeof ALLOWED_CANONICAL_UNITS)[number];

/** Нормализация строки единицы → внутренний код (как в БД). */
export function normalizeIngredientUnit(unit: string | null | undefined): string | null {
  if (unit == null) return null;
  let u = String(unit).trim().toLowerCase();
  if (!u) return null;
  u = u.replace(/\.$/, "");
  const compact = u.replace(/\s+/g, "");
  if (["г", "гр", "g", "грамм"].includes(u)) return "g";
  if (["кг", "kg", "килограмм"].includes(u)) return "kg";
  if (["мл", "ml", "миллилитр"].includes(u)) return "ml";
  if (["л", "l", "литр"].includes(u)) return "l";
  if (["шт", "шт.", "pcs", "штук"].includes(u) || /^шт/.test(compact)) return "pcs";
  if (["ч.л", "ч.л.", "чайная ложка", "tsp", "чл"].includes(u) || /^ч[.\s]*л/.test(compact)) return "tsp";
  if (["ст.л", "ст.л.", "столовая ложка", "tbsp", "стл"].includes(u) || /^ст[.\s]*л/.test(compact))
    return "tbsp";
  return u;
}

/** Парсинг хвоста display_text после «—» / «-»: «150 г», «1 шт.». */
export function parseDisplayTextTailForAmountUnit(displayText: string): { amount: number; unitRaw: string | null } | null {
  const d = (displayText ?? "").trim();
  if (!d) return null;
  const parts = d.split(/\s*[—\-]\s*/);
  if (parts.length < 2) return null;
  const rest = parts[parts.length - 1]?.trim() ?? "";
  const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return null;
  const numPart = m[1].replace(",", ".");
  const am = parseFloat(numPart);
  if (!Number.isFinite(am) || am <= 0) return null;
  const u = (m[2] ?? "").trim();
  return { amount: am, unitRaw: u === "" ? null : u };
}

export function parseFlexibleAmount(amount: unknown): number | null {
  if (amount == null) return null;
  if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) return amount;
  const s = String(amount).trim().replace(",", ".");
  if (!/^\d+\.?\d*$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Как `ingredient_canonical(amount_num, unit_text)` в PostgreSQL: kg/l → g/ml, иначе amount + нормализованная единица.
 */
export function resolveCanonicalFromAmountAndUnit(
  amountNum: number,
  unitText: string | null | undefined,
): { canonical_amount: number; canonical_unit: AllowedCanonicalUnit } | null {
  if (!Number.isFinite(amountNum) || amountNum <= 0) return null;
  const norm = normalizeIngredientUnit(unitText);
  if (norm == null) return null;
  if (norm === "kg") return { canonical_amount: amountNum * 1000, canonical_unit: "g" };
  if (norm === "l") return { canonical_amount: amountNum * 1000, canonical_unit: "ml" };
  if ((ALLOWED_CANONICAL_UNITS as readonly string[]).includes(norm)) {
    return { canonical_amount: amountNum, canonical_unit: norm as AllowedCanonicalUnit };
  }
  return null;
}

export function isPlausibleCanonical(canonicalAmount: number, canonicalUnit: string): boolean {
  if (!Number.isFinite(canonicalAmount) || canonicalAmount <= 0) return false;
  const u = canonicalUnit.toLowerCase();
  if (u === "g" && canonicalAmount > 500_000) return false;
  if (u === "ml" && canonicalAmount > 500_000) return false;
  if (u === "pcs" && canonicalAmount > 200) return false;
  if ((u === "tsp" || u === "tbsp") && canonicalAmount > 500) return false;
  return true;
}

export function isValidStoredCanonicalPair(
  canonicalAmount: number | null | undefined,
  canonicalUnit: string | null | undefined,
): boolean {
  if (canonicalAmount == null || canonicalUnit == null) return false;
  const ca = Number(canonicalAmount);
  const cu = String(canonicalUnit).trim().toLowerCase();
  if (!Number.isFinite(ca) || ca <= 0) return false;
  if (!(ALLOWED_CANONICAL_UNITS as readonly string[]).includes(cu)) return false;
  return isPlausibleCanonical(ca, cu);
}

export type CanonicalResolutionSource = "amount_unit" | "display_text";

/**
 * Пытается получить канон из amount+unit, иначе из хвоста display_text.
 */
export function tryResolveCanonicalFromIngredientFields(input: {
  amount: unknown;
  unit: string | null | undefined;
  display_text: string | null | undefined;
}): { canonical_amount: number; canonical_unit: AllowedCanonicalUnit; source: CanonicalResolutionSource } | null {
  const amt = parseFlexibleAmount(input.amount);
  if (amt != null) {
    const u = input.unit != null && String(input.unit).trim() !== "" ? input.unit : null;
    const r = resolveCanonicalFromAmountAndUnit(amt, u);
    if (r && isPlausibleCanonical(r.canonical_amount, r.canonical_unit)) {
      return { ...r, source: "amount_unit" };
    }
  }
  const dt = (input.display_text ?? "").trim();
  if (dt) {
    const tail = parseDisplayTextTailForAmountUnit(dt);
    if (tail) {
      const r = resolveCanonicalFromAmountAndUnit(tail.amount, tail.unitRaw);
      if (r && isPlausibleCanonical(r.canonical_amount, r.canonical_unit)) {
        return { ...r, source: "display_text" };
      }
    }
  }
  return null;
}

export type SeedIngredientLike = {
  name?: string | null;
  amount?: unknown;
  unit?: string | null;
  display_text?: string | null;
  canonical_amount?: number | null;
  canonical_unit?: string | null;
};

/**
 * Для импорта сида: сохраняем явный канон из JSON, если валиден; иначе вычисляем из amount/unit или display_text.
 */
export function fillCanonicalForSeedIngredient(ing: SeedIngredientLike): {
  canonical_amount: number | null;
  canonical_unit: string | null;
} {
  if (isValidStoredCanonicalPair(ing.canonical_amount, ing.canonical_unit)) {
    const ca = Number(ing.canonical_amount);
    const cu = String(ing.canonical_unit).trim().toLowerCase();
    if (cu === "kg") return { canonical_amount: ca * 1000, canonical_unit: "g" };
    if (cu === "l") return { canonical_amount: ca * 1000, canonical_unit: "ml" };
    return { canonical_amount: ca, canonical_unit: cu };
  }
  const displayText = (ing.display_text ?? ing.name ?? "").trim() || null;
  const resolved = tryResolveCanonicalFromIngredientFields({
    amount: ing.amount,
    unit: ing.unit,
    display_text: displayText,
  });
  if (!resolved) return { canonical_amount: null, canonical_unit: null };
  return { canonical_amount: resolved.canonical_amount, canonical_unit: resolved.canonical_unit };
}
