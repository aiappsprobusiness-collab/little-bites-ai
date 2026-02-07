import type { Family, GenerationContext } from "./types";

/** Trial and premium both get family mode; free does not. */
function hasPremiumAccess(plan: "free" | "trial" | "premium"): boolean {
  return plan === "premium" || plan === "trial";
}

/**
 * Builds a GenerationContext from family, active profile selection, and plan.
 */
export function buildGenerationContext(
  family: Family,
  activeProfileId: string | "family",
  plan: "free" | "trial" | "premium"
): GenerationContext {
  if (activeProfileId !== "family") {
    const profile = family.profiles.find((p) => p.id === activeProfileId);
    return { mode: "single", target: profile };
  }

  if (!hasPremiumAccess(plan)) {
    const first = family.profiles[0];
    return { mode: "single", target: first };
  }

  return { mode: "family", targets: family.profiles };
}
