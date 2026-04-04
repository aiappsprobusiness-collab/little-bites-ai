/**
 * Универсальный quality gate для dual household: читаемость дробей, надёжность, масштаб.
 * Без привязки к списку продуктов (тыква/морковь и т.д.).
 */

export type HouseholdReliability = "high" | "medium" | "low" | "none";

/** Допустимые «бытовые» количества: целые 1–30 и кратные 0.25 в разумном диапазоне. */
export function isHumanReadableHouseholdQuantity(n: number): boolean {
  if (!Number.isFinite(n) || n <= 0) return false;
  if (n > 30) return false;
  const intPart = Math.floor(n);
  const frac = n - intPart;
  if (Math.abs(frac) < 1e-6) return intPart >= 1 && intPart <= 30;
  const quarters = Math.round(frac * 4);
  if (Math.abs(frac - quarters / 4) > 1e-4) return false;
  return quarters === 1 || quarters === 2 || quarters === 3;
}

/** Тип бытовой меры для quality gate (без отдельного «яйцо» — в gate это `piece`). */
export type DualMeasurementCandidateKind =
  | "tablespoon"
  | "teaspoon"
  | "clove"
  | "piece"
  | "slice"
  | "pinch"
  | "cup"
  | "jar_or_pack"
  | "other_explicit";

export type DualQualityGateInput = {
  householdAmount: number;
  /** high: explicit в тексте; medium: вывод из canonical + категория/якоря; low: слабые эвристики */
  reliability: HouseholdReliability;
  canonicalAmount: number;
  canonicalUnit: "g" | "ml";
  /** Явно распарсенная бытовая мера из ввода (приоритет 1). */
  explicitHousehold: boolean;
  candidateKind: DualMeasurementCandidateKind;
};

/**
 * Универсальный gate: читаемость + минимальная надёжность + (для piece) осмысленность vs голые граммы.
 */
export function passesDualMeasurementQualityGate(input: DualQualityGateInput): boolean {
  const { householdAmount, reliability, explicitHousehold, candidateKind } = input;
  if (!isHumanReadableHouseholdQuantity(householdAmount)) return false;

  if (reliability === "none") return false;
  if (reliability === "low" && !explicitHousehold) return false;
  if (reliability === "medium" && !explicitHousehold && candidateKind === "piece") {
    // выведенный «шт» из граммов без явного ввода — только medium+читаемость, без дробных крошек
    if (householdAmount < 0.5) return false;
  }

  if (candidateKind === "piece" && !explicitHousehold) {
    if (householdAmount < 0.5) return false;
  }

  return true;
}

/** После масштаба порций: если household перестаёт быть читаемым — показываем только канон (временный UX-fallback). */
export function scaledHouseholdStaysReadableForDual(
  baseDisplayAmount: number,
  servingMultiplier: number,
): boolean {
  if (servingMultiplier <= 0 || !Number.isFinite(servingMultiplier)) return false;
  const scaled = baseDisplayAmount * servingMultiplier;
  return isHumanReadableHouseholdQuantity(Math.round(scaled * 1000) / 1000);
}
