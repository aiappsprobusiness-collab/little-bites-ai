export const INFANT_PREMIUM_AUTOREPLACE_LIMIT_PER_SLOT_PER_DAY = 5;
export const DEFAULT_PREMIUM_AUTOREPLACE_LIMIT_PER_SLOT_PER_DAY = 3;

export type InfantPoolExhaustedReason = "limit_reached" | "candidates_exhausted";

export function isInfantAutoreplaceContext(params: {
  isInfantPlanUi: boolean;
  isFree: boolean;
}): boolean {
  return params.isInfantPlanUi && !params.isFree;
}

export function getSlotDayKey(dayKey: string, mealType: string): string {
  return `${dayKey}_${mealType}`;
}

export function getAutoReplaceLimitPerSlotPerDay(params: {
  isInfantPremiumContext: boolean;
}): number {
  return params.isInfantPremiumContext
    ? INFANT_PREMIUM_AUTOREPLACE_LIMIT_PER_SLOT_PER_DAY
    : DEFAULT_PREMIUM_AUTOREPLACE_LIMIT_PER_SLOT_PER_DAY;
}

export function isInfantAutoReplaceLimitReached(count: number): boolean {
  return count >= INFANT_PREMIUM_AUTOREPLACE_LIMIT_PER_SLOT_PER_DAY;
}
