/**
 * Age context for plan/pool: whether to filter recipes by age and which age to use.
 * adult/family or unknown age => no age filter (applyFilter false).
 */

export interface MemberAgeContext {
  ageMonths: number | undefined;
  applyFilter: boolean;
}

const ADULT_AGE_MONTHS = 216; // 18 years

/**
 * Returns true if the member is treated as adult: no infant recipes, no age filter for pool.
 * Used to exclude infant-only recipes (max_age_months <= 12) from plan for adults.
 */
export function isAdultContext(member: {
  age_months?: number | null;
  type?: string | null;
} | null | undefined): boolean {
  if (!member) return false;
  const type = (member.type ?? "").toLowerCase();
  if (type === "adult" || type === "family") return true;
  const ageMonths = member.age_months != null && Number.isFinite(member.age_months)
    ? Math.max(0, Math.round(Number(member.age_months)))
    : undefined;
  return ageMonths != null && ageMonths >= ADULT_AGE_MONTHS;
}

/**
 * From member payload (e.g. body.member_data or plan job context).
 * If age_months is set and < 18y → applyFilter true. Otherwise no age filter.
 */
export function getMemberAgeContext(member: {
  age_months?: number | null;
  type?: string | null;
} | null | undefined): MemberAgeContext {
  if (!member) return { ageMonths: undefined, applyFilter: false };
  const type = (member.type ?? "").toLowerCase();
  if (type === "adult" || type === "family") return { ageMonths: undefined, applyFilter: false };
  const ageMonths = member.age_months != null && Number.isFinite(member.age_months)
    ? Math.max(0, Math.round(Number(member.age_months)))
    : undefined;
  if (ageMonths == null) return { ageMonths: undefined, applyFilter: false };
  if (ageMonths >= ADULT_AGE_MONTHS) return { ageMonths: undefined, applyFilter: false };
  return { ageMonths, applyFilter: true };
}
