/**
 * Family mode: plan/chat for "general table" (общий стол).
 * - Age restrictions (consistency, salt, spices, infant texture) are NOT applied.
 * - Allergies and dislikes of ALL family members ARE applied.
 * - infant = age_months < 12; we only ignore infant age requirements (puree, separate feeding), not allergies.
 */

export type MemberWithAge = {
  id?: string;
  name?: string;
  age_months?: number | null;
  allergies?: string[] | null;
  preferences?: string[] | null;
  likes?: string[] | null;
  dislikes?: string[] | null;
  [k: string]: unknown;
};

/** infant = member.age_months < 12 (strictly under 12 months). */
export function isInfant(member: MemberWithAge | null | undefined): boolean {
  if (!member) return false;
  const age = member.age_months;
  return age != null && Number.isFinite(age) && age < 12;
}

/** Returns true when plan/chat is in family mode (member_id null or mode "family"). */
export function isFamilyMode(memberId: string | null | undefined, mode?: string): boolean {
  if (mode === "family") return true;
  return memberId == null;
}

export type FamilyConstraints = {
  allergies: string[];
  dislikes: string[];
  preferences: string[];
  likes: string[];
};

/**
 * Merges allergies, dislikes, preferences, likes from ALL members.
 * In family-mode we do NOT apply age-based restrictions, but we DO account for every member's allergies and dislikes.
 */
export function buildFamilyConstraints(members: MemberWithAge[]): FamilyConstraints {
  const allergiesSet = new Set<string>();
  const dislikesSet = new Set<string>();
  const preferencesSet = new Set<string>();
  const likesSet = new Set<string>();

  for (const m of members) {
    (m.allergies ?? []).forEach((a) => (typeof a === "string" && a.trim() ? allergiesSet.add(a.trim()) : null));
    (m.dislikes ?? []).forEach((d) => (typeof d === "string" && d.trim() ? dislikesSet.add(d.trim()) : null));
    (m.preferences ?? []).forEach((p) => (typeof p === "string" && p.trim() ? preferencesSet.add(p.trim()) : null));
    (m.likes ?? []).forEach((l) => (typeof l === "string" && l.trim() ? likesSet.add(l.trim()) : null));
  }

  return {
    allergies: [...allergiesSet],
    dislikes: [...dislikesSet],
    preferences: [...preferencesSet],
    likes: [...likesSet],
  };
}

/** Adult age / type so that no age filter is applied in plan (pool). */
const ADULT_AGE_MONTHS = 216;

/**
 * Builds member data for plan generation in family mode: constraints from ALL members, no age filter.
 * Use in generate-plan when member_id == null.
 */
export function buildFamilyMemberDataForPlan(members: MemberWithAge[]): {
  allergies?: string[];
  preferences?: string[];
  likes?: string[];
  dislikes?: string[];
  age_months?: number;
  type: string;
} {
  const c = buildFamilyConstraints(members);
  return {
    allergies: c.allergies.length ? c.allergies : undefined,
    preferences: c.preferences.length ? c.preferences : undefined,
    likes: c.likes.length ? c.likes : undefined,
    dislikes: c.dislikes.length ? c.dislikes : undefined,
    type: "adult",
  };
}

/**
 * Builds member data for chat prompt in family mode: constraints from ALL members, adult age.
 * No "для ребёнка" / infant age rules; universal recipe, pool-safe.
 */
export function buildFamilyMemberDataForChat(members: MemberWithAge[]): {
  name: string;
  age_months: number;
  allergies: string[];
  preferences?: string[];
  likes?: string[];
  dislikes?: string[];
} {
  const c = buildFamilyConstraints(members);
  return {
    name: "Семья",
    age_months: ADULT_AGE_MONTHS,
    allergies: c.allergies,
    preferences: c.preferences.length ? c.preferences : undefined,
    likes: c.likes.length ? c.likes : undefined,
    dislikes: c.dislikes.length ? c.dislikes : undefined,
  };
}
