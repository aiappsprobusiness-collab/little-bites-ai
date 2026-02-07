import type { GenerationContext, Profile } from "./types";
import type { MemberWithAgeMonths } from "./derivePayloadFromContext";

function getAgeMonths(profile: Profile, lookup?: MemberWithAgeMonths[]): number {
  const m = lookup?.find((x) => x.id === profile.id);
  if (m?.age_months != null && Number.isFinite(m.age_months)) return Math.max(0, m.age_months);
  if (profile.age != null && Number.isFinite(profile.age)) return Math.round(profile.age * 12);
  return 0;
}

function formatAge(ageMonths: number): string {
  if (ageMonths < 12) return `${ageMonths} мес`;
  const y = Math.floor(ageMonths / 12);
  const rest = ageMonths % 12;
  return rest ? `${y} г. ${rest} мес` : `${y} ${y === 1 ? "год" : y < 5 ? "года" : "лет"}`;
}

function formatDifficulty(d?: string): string {
  if (!d || !d.trim()) return "";
  const s = d.trim().toLowerCase();
  if (s === "easy") return "Простые";
  if (s === "medium") return "Средние";
  if (s === "any") return "Любые";
  return d;
}

function profileBlock(p: Profile, lookup?: MemberWithAgeMonths[]): string {
  const ageMonths = getAgeMonths(p, lookup);
  const ageStr = formatAge(ageMonths);
  const allergies = (p.allergies ?? []).filter((a) => a?.trim());
  const preferences = (p.preferences ?? []).filter((a) => a?.trim());
  const difficulty = formatDifficulty(p.difficulty);

  const lines: string[] = [
    `- name: ${(p.name || "").trim() || "—"}`,
    `  age: ${ageStr}`,
    `  allergies: [${allergies.length ? allergies.map((a) => `"${a}"`).join(", ") : ""}]`,
  ];
  if (preferences.length) {
    lines.push(`  preferences: [${preferences.map((a) => `"${a}"`).join(", ")}]`);
  }
  if (difficulty) {
    lines.push(`  difficulty: ${difficulty}`);
  }
  return lines.join("\n");
}

/**
 * Builds a structured prompt context block from GenerationContext for the LLM.
 * Single mode: one child with age, allergies, preferences, difficulty.
 * Family mode: list each child with name, age, allergies, preferences, difficulty + instruction.
 * Missing preferences/difficulty are omitted (backward compatible).
 */
export function buildPrompt(
  context: GenerationContext,
  membersWithAgeMonths: MemberWithAgeMonths[] = []
): string {
  if (context.mode === "single" && context.target) {
    const p = context.target;
    const parts: string[] = [
      "Generation context (single):",
      profileBlock(p, membersWithAgeMonths),
    ];
    return parts.join("\n");
  }

  if (context.mode === "family" && context.targets && context.targets.length > 0) {
    const blocks = context.targets.map((p) => profileBlock(p, membersWithAgeMonths));
    const parts: string[] = [
      "Generation context (family):",
      "Children:",
      ...blocks,
      "",
      "Generate a recipe suitable for all children in the family, respecting all allergies and preferences.",
    ];
    return parts.join("\n");
  }

  return "";
}
