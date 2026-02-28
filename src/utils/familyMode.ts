/**
 * Family mode: effective members (>= 24 months or no age) vs excluded young children (< 24 months).
 * Mirrors Edge logic for UI/tests; plan and chat constraints use included only.
 */

const FAMILY_AGE_THRESHOLD_MONTHS = 24;

export type MemberWithAge = {
  id?: string;
  name?: string;
  age_months?: number | null;
  allergies?: string[] | null;
  preferences?: string[] | null;
  likes?: string[] | null;
  dislikes?: string[] | null;
};

export type FamilyEffectiveResult<T> = {
  included: T[];
  excludedYoung: T[];
};

/**
 * Splits members into included (age_months == null or >= 24) and excludedYoung (< 24).
 */
export function getFamilyEffectiveMembers<T extends MemberWithAge>(
  allMembers: T[]
): FamilyEffectiveResult<T> {
  const included: T[] = [];
  const excludedYoung: T[] = [];
  for (const m of allMembers) {
    const age = m.age_months != null && Number.isFinite(m.age_months) ? m.age_months : null;
    if (age == null || age >= FAMILY_AGE_THRESHOLD_MONTHS) {
      included.push(m);
    } else {
      excludedYoung.push(m);
    }
  }
  return { included, excludedYoung };
}
