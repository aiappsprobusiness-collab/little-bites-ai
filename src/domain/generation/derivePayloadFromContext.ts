import type { GenerationContext, Profile } from "./types";

/** Same shape as Edge Function expects for memberData (ageMonths, allergies, etc.). */
export interface MemberDataPayload {
  name: string;
  birth_date?: string;
  ageMonths: number;
  allergies?: string[];
  ageDescription?: string;
}

export interface AllMemberPayload {
  name: string;
  age_months: number;
  allergies: string[];
}

export interface DerivedPayload {
  memberData: MemberDataPayload | undefined;
  allMembers: AllMemberPayload[];
  targetIsFamily: boolean;
}

/** Members with age_months for lookup (e.g. freshMembers from useMembers). */
export interface MemberWithAgeMonths {
  id: string;
  name: string;
  age_months?: number | null;
  allergies?: string[] | null;
}

function getAgeMonths(profile: Profile, lookup?: MemberWithAgeMonths[]): number {
  const m = lookup?.find((x) => x.id === profile.id);
  if (m?.age_months != null && Number.isFinite(m.age_months)) return Math.max(0, m.age_months);
  if (profile.age != null && Number.isFinite(profile.age)) return Math.round(profile.age * 12);
  return 0;
}

function formatAgePart(ageMonths: number): string {
  if (ageMonths < 12) return `${ageMonths} мес`;
  const y = Math.floor(ageMonths / 12);
  const rest = ageMonths % 12;
  return rest ? `${y} г. ${rest} мес` : `${y} ${y === 1 ? "год" : y < 5 ? "года" : "лет"}`;
}

/**
 * Derives API payload (memberData, allMembers, targetIsFamily) from GenerationContext.
 * Keeps backward compatibility with Edge Function and old code that expects age/allergies from context.target.
 */
export function derivePayloadFromContext(
  context: GenerationContext,
  membersWithAgeMonths: MemberWithAgeMonths[] = []
): DerivedPayload {
  if (context.mode === "single" && context.target) {
    const p = context.target;
    const ageMonths = getAgeMonths(p, membersWithAgeMonths);
    const allergies = (p.allergies ?? []).filter((a) => a?.trim());
    return {
      memberData: {
        name: p.name,
        ageMonths,
        allergies: allergies.length ? allergies : undefined,
      },
      allMembers: [],
      targetIsFamily: false,
    };
  }

  if (context.mode === "family" && context.targets && context.targets.length > 0) {
    const targets = context.targets;
    const ages = targets.map((t) => getAgeMonths(t, membersWithAgeMonths));
    const ageMonths = Math.min(...ages);
    const allAllergies = new Set<string>();
    targets.forEach((t) => (t.allergies ?? []).forEach((a) => a?.trim() && allAllergies.add(a.trim())));
    const names = targets.map((t) => t.name).join(", ");
    const ageParts = targets.map((t) => formatAgePart(getAgeMonths(t, membersWithAgeMonths)));
    const ageDescription = ageParts.join(", ");
    const allMembers: AllMemberPayload[] = targets.map((t) => ({
      name: t.name,
      age_months: getAgeMonths(t, membersWithAgeMonths),
      allergies: t.allergies ?? [],
    }));
    return {
      memberData: {
        name: names,
        ageMonths,
        allergies: allAllergies.size ? Array.from(allAllergies) : undefined,
        ageDescription,
      },
      allMembers,
      targetIsFamily: true,
    };
  }

  return { memberData: undefined, allMembers: [], targetIsFamily: false };
}
