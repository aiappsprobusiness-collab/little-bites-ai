import type { GenerationContext, Profile } from "./types";
import type { MemberWithAgeMonths } from "./derivePayloadFromContext";

function getAgeMonths(profile: Profile, lookup?: MemberWithAgeMonths[]): number {
  const m = lookup?.find((x) => x.id === profile.id);
  if (m?.age_months != null && Number.isFinite(m.age_months)) return Math.max(0, m.age_months);
  if (profile.age != null && Number.isFinite(profile.age)) return Math.round(profile.age * 12);
  return 0;
}

function formatDifficulty(d?: string): string {
  if (!d || !d.trim()) return "";
  const s = d.trim().toLowerCase();
  if (s === "easy") return "Простые";
  if (s === "medium") return "Средние";
  if (s === "any") return "Любые";
  return d;
}

/** One child block in STRICT format for the LLM. */
function profileBlock(p: Profile, lookup?: MemberWithAgeMonths[]): string {
  const ageMonths = getAgeMonths(p, lookup);
  const allergies = (p.allergies ?? []).filter((a) => a?.trim());
  const preferences = (p.preferences ?? []).filter((a) => a?.trim());
  const difficulty = formatDifficulty(p.difficulty) || "any";

  const lines: string[] = [
    `Child:`,
    `- Age: ${ageMonths} months`,
    `- Allergies (STRICT): ${allergies.length ? allergies.join(", ") : "none"}`,
    `- Preferences (STRICT): ${preferences.length ? preferences.join(", ") : "none"}`,
    `- Difficulty: ${difficulty}`,
  ];
  return lines.join("\n");
}

/**
 * Builds a structured prompt context block from GenerationContext for the LLM.
 * Uses STRICT format: Age, Allergies (STRICT), Preferences (STRICT), Difficulty.
 * Single: one child block. Family: list each child then instruction to respect ALL.
 */
export function buildPrompt(
  context: GenerationContext,
  membersWithAgeMonths: MemberWithAgeMonths[] = []
): string {
  if (context.mode === "single" && context.target) {
    return profileBlock(context.target, membersWithAgeMonths);
  }

  if (context.mode === "family" && context.targets && context.targets.length > 0) {
    const blocks = context.targets.map((p) => profileBlock(p, membersWithAgeMonths));
    const parts: string[] = [
      ...blocks,
      "",
      "Generate ONE recipe that is safe and suitable for ALL children above.",
      "You must respect ALL allergies and ALL preferences.",
    ];
    return parts.join("\n");
  }

  return "";
}
