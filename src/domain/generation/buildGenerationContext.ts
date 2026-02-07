import type { Family, GenerationContext, Profile } from "./types";

/** Trial and premium both get family mode; free does not. */
function hasPremiumAccess(plan: "free" | "trial" | "premium"): boolean {
  return plan === "premium" || plan === "trial";
}

function isDefinedProfile(p: Profile | null | undefined): p is Profile {
  return p != null;
}

/**
 * Builds a GenerationContext from family, active profile selection, and plan.
 * Single mode: always returns a valid target (fallback to first profile if id not found).
 * Family mode: targets are filtered to exclude null/undefined.
 */
export function buildGenerationContext(
  family: Family,
  activeProfileId: string | "family",
  plan: "free" | "trial" | "premium"
): GenerationContext {
  if (activeProfileId !== "family") {
    const profile =
      family.profiles.find((p) => p.id === activeProfileId) ?? family.profiles[0];
    return { mode: "single", target: profile };
  }

  if (!hasPremiumAccess(plan)) {
    const first = family.profiles[0];
    return { mode: "single", target: first };
  }

  const targets = family.profiles.filter(isDefinedProfile);
  return { mode: "family", targets };
}
