import type { Family, GenerationContext } from "./types";

/**
 * Builds a GenerationContext from family, active profile selection, and plan.
 * Not wired into UI or generation yet.
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

  if (plan !== "premium") {
    const first = family.profiles[0];
    return { mode: "single", target: first };
  }

  return { mode: "family", targets: family.profiles };
}
