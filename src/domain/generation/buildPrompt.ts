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

/** One child block in STRICT format for the LLM (no extra headers). */
function profileBlock(p: Profile, lookup?: MemberWithAgeMonths[]): string {
  const ageMonths = getAgeMonths(p, lookup);
  const allergies = (p.allergies ?? []).filter((a) => a?.trim());
  const likes = (p.likes ?? []).filter((a) => a?.trim());
  const dislikes = (p.dislikes ?? []).filter((a) => a?.trim());
  const difficulty = formatDifficulty(p.difficulty) || "any";

  const lines: string[] = [
    `- Age: ${ageMonths} months`,
    `- Allergies (STRICT): ${allergies.length ? allergies.join(", ") : "none"}`,
    `- Likes (soft): ${likes.length ? likes.join(", ") : "none"}`,
    `- Dislikes (STRICT): ${dislikes.length ? dislikes.join(", ") : "none"}`,
    `- Difficulty: ${difficulty}`,
  ];
  return lines.join("\n");
}

/**
 * Builds a structured prompt context block from GenerationContext for the LLM.
 * Single: "Child:" + one block. Family: "Children:" + "Child 1:", "Child 2:", ... + instruction.
 */
export function buildPrompt(
  context: GenerationContext,
  membersWithAgeMonths: MemberWithAgeMonths[] = []
): string {
  if (context.mode === "single" && context.target) {
    const block = profileBlock(context.target, membersWithAgeMonths);
    return `Child:\n${block}`;
  }

  if (context.mode === "family" && context.targets && context.targets.length > 0) {
    const childBlocks = context.targets.map((p, i) => {
      const block = profileBlock(p, membersWithAgeMonths);
      return `Child ${i + 1}:\n${block}`;
    });
    const parts: string[] = [
      "Children:",
      ...childBlocks,
      "",
      "Generate ONE recipe that is safe and suitable for ALL children above.",
      "You must respect ALL allergies and ALL dislikes.",
    ];
    return parts.join("\n");
  }

  return "";
}
