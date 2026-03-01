/**
 * Server-truth generation context block for family mode.
 * Replaces frontend generationContextBlock in family mode: no "Children:", no "safe for ALL children", no infants <12m.
 */

export type MemberForFamilyBlock = {
  name?: string | null;
  age_months?: number | null;
  allergies?: string[] | null;
  dislikes?: string[] | null;
  likes?: string[] | null;
  [k: string]: unknown;
};

function formatAge(ageMonths: number | null | undefined): string {
  if (ageMonths == null || !Number.isFinite(ageMonths)) return "age not set";
  if (ageMonths < 12) return `${ageMonths} months`;
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  if (months === 0) return years === 1 ? "1 year" : `${years} years`;
  return `${years} y ${months} mo`;
}

/**
 * Builds the generation context block for family mode (shared table).
 * membersForPrompt already excludes infants <12m when there is at least one >=12m.
 * Do NOT use "Children:", "safe for ALL children", or include infants.
 */
export function buildFamilyGenerationContextBlock(params: {
  membersForPrompt: MemberForFamilyBlock[];
  applyKidFilter: boolean;
}): string {
  const { membersForPrompt, applyKidFilter } = params;
  const lines: string[] = [
    "FAMILY MODE (shared table):",
    "We consider ALL members listed below (infants under 12 months are excluded).",
    "",
  ];

  membersForPrompt.forEach((m, i) => {
    const name = (m.name ?? `Member ${i + 1}`).trim() || `Member ${i + 1}`;
    const age = formatAge(m.age_months ?? null);
    const allergies = (m.allergies ?? []).filter((a) => typeof a === "string" && a.trim()).map((a) => a.trim());
    const dislikes = (m.dislikes ?? []).filter((d) => typeof d === "string" && d.trim()).map((d) => d.trim());
    const likes = (m.likes ?? []).filter((l) => typeof l === "string" && l.trim()).map((l) => l.trim());

    lines.push(`${name}: ${age}.`);
    lines.push(`  Allergies (STRICT, never use): ${allergies.length ? allergies.join(", ") : "none"}.`);
    lines.push(`  Dislikes (STRICT, never use): ${dislikes.length ? dislikes.join(", ") : "none"}.`);
    lines.push(`  Likes (SOFT preferences): ${likes.length ? likes.join(", ") : "none"}.`);
    lines.push("");
  });

  lines.push(
    "Generate ONE recipe suitable for shared family table. Respect ALL allergies and ALL dislikes. Likes are soft preferences."
  );
  if (applyKidFilter) {
    lines.push(
      "Additionally apply kid safety for ages 1–3: minimal salt/sugar, no deep fry/spicy/smoked, avoid choking hazards, prefer soft pieces and stewing/baking."
    );
  }

  return lines.join("\n").trim();
}
