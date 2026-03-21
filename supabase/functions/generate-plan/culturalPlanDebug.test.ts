import {
  CULTURAL_CLASSIC_BONUS,
  CULTURAL_SPECIFIC_PENALTY,
} from "./culturalPlanScoring.ts";
import {
  accumulateCulturalSummary,
  buildCulturalPickComparison,
  compareScoredForSlot,
  createEmptyCulturalSummaryAccumulator,
  finalizeCulturalSummary,
  type ScoredCandidateRow,
} from "./culturalPlanDebug.ts";

function row(
  id: string,
  trustTier: number,
  finalBefore: number,
  familiarity: string,
  culturalBonus: number,
): ScoredCandidateRow {
  const finalAfter = finalBefore + culturalBonus;
  return {
    r: { id, title: `t-${id}`, familiarity, trust_level: trustTier === 0 ? "trusted" : "candidate" },
    finalScoreAfterCultural: finalAfter,
    goalBonus: 0,
    ageBonus: 0,
    softBonus: 0,
    culturalBonus,
    baseScore: finalBefore,
    finalBeforeCultural: finalBefore,
    trustTier,
  };
}

Deno.test("compareScoredForSlot: trust tier beats cultural (candidate never wins over trusted)", () => {
  const scored: ScoredCandidateRow[] = [
    row("trusted_low", 0, 5, "specific", -CULTURAL_SPECIFIC_PENALTY),
    row("candidate_high", 1, 100, "classic", CULTURAL_CLASSIC_BONUS),
  ];
  const sorted = [...scored].sort((a, b) => compareScoredForSlot(a, b, "with_cultural"));
  if (sorted[0]!.r.id !== "trusted_low") throw new Error("trusted must win despite lower final score");
  const sortedNo = [...scored].sort((a, b) => compareScoredForSlot(a, b, "without_cultural"));
  if (sortedNo[0]!.r.id !== "trusted_low") throw new Error("trusted must win without cultural too");
});

Deno.test("buildCulturalPickComparison: changed_by_cultural false when same winner", () => {
  const scored: ScoredCandidateRow[] = [
    row("a", 0, 10, "adapted", 0),
    row("b", 0, 8, "classic", CULTURAL_CLASSIC_BONUS),
  ];
  const c = buildCulturalPickComparison(scored);
  if (!c) throw new Error("comparison");
  if (c.changed_by_cultural) throw new Error("winner should stay a (10 > 8+0.75)");
  if (c.winner_with_cultural.id !== "a" || c.winner_without_cultural.id !== "a") throw new Error("same winner");
});

Deno.test("buildCulturalPickComparison: changed_by_cultural true when classic displaces specific within tier", () => {
  const scored: ScoredCandidateRow[] = [
    row("spec", 0, 10, "specific", -CULTURAL_SPECIFIC_PENALTY),
    row("clas", 0, 9.5, "classic", CULTURAL_CLASSIC_BONUS),
  ];
  const c = buildCulturalPickComparison(scored);
  if (!c) throw new Error("comparison");
  if (!c.changed_by_cultural) throw new Error("cultural should flip winner");
  if (c.winner_without_cultural.id !== "spec") throw new Error("before: higher base");
  if (c.winner_with_cultural.id !== "clas") throw new Error("after: classic bonus");
  if (c.score_delta_for_winner !== CULTURAL_CLASSIC_BONUS) throw new Error("delta = bonus of winner");
});

Deno.test("finalizeCulturalSummary: counts and displacement classic_over_specific", () => {
  const acc = createEmptyCulturalSummaryAccumulator();
  const pool = { classic: 1, adapted: 1, specific: 0, other: 0 };
  const spec = row("spec", 0, 10, "specific", -CULTURAL_SPECIFIC_PENALTY);
  const clas = row("clas", 0, 9.5, "classic", CULTURAL_CLASSIC_BONUS);
  const c1 = buildCulturalPickComparison([spec, clas])!;
  accumulateCulturalSummary(acc, c1, pool, c1.score_delta_for_winner);
  const same = row("x", 0, 10, "adapted", 0);
  const c2 = buildCulturalPickComparison([same, row("y", 0, 5, "adapted", 0)])!;
  accumulateCulturalSummary(acc, c2, pool, c2.score_delta_for_winner);
  const out = finalizeCulturalSummary(acc, "req-1");
  if (out.total_picks !== 2) throw new Error("total_picks");
  if (out.changed_by_cultural_count !== 1) throw new Error("changed count");
  if (out.changed_by_cultural_rate !== 0.5) throw new Error("rate");
  if (out.displacement.classic_over_specific_count !== 1) throw new Error("classic_over_specific");
  if (out.displacement.no_change_count !== 1) throw new Error("no_change");
  if (out.winners_by_familiarity_before.specific !== 1 || out.winners_by_familiarity_after.classic !== 1) {
    throw new Error("familiarity before/after");
  }
});
