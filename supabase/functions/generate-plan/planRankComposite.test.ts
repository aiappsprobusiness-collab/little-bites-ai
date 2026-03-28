import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  compareScoredForSlot,
  type ScoredCandidateRow,
} from "./culturalPlanDebug.ts";
import {
  dbScoreContribution,
  explorationPickActive,
  EXPLORATION_CANDIDATE_BOOST,
  isCandidateTrustLevel,
  stableSortPoolForRanking,
  trustRankingBonus,
} from "./planRankComposite.ts";

Deno.test("trustRankingBonus: core and trusted well above candidate", () => {
  assertEquals(trustRankingBonus("core") > trustRankingBonus("candidate"), true);
  assertEquals(trustRankingBonus("trusted") > trustRankingBonus("candidate"), true);
  assertEquals(trustRankingBonus("core") >= trustRankingBonus("trusted"), true);
});

Deno.test("dbScoreContribution: monotone and clamped", () => {
  assertEquals(dbScoreContribution(0), 0);
  assertEquals(dbScoreContribution(10) > dbScoreContribution(0), true);
  assertEquals(dbScoreContribution(-100), -4);
  assertEquals(dbScoreContribution(100), 22);
});

Deno.test("isCandidateTrustLevel: candidate and null", () => {
  assertEquals(isCandidateTrustLevel("candidate"), true);
  assertEquals(isCandidateTrustLevel(null), true);
  assertEquals(isCandidateTrustLevel(undefined), true);
  assertEquals(isCandidateTrustLevel("core"), false);
  assertEquals(isCandidateTrustLevel("trusted"), false);
});

Deno.test("explorationPickActive: deterministic from salt", () => {
  const a = explorationPickActive("fixed-salt-test-1|run|breakfast", 50);
  const b = explorationPickActive("fixed-salt-test-1|run|breakfast", 50);
  assertEquals(a, b);
});

Deno.test("stableSortPoolForRanking: trust tier then score desc then id", () => {
  const rows = [
    { id: "b", trust_level: "candidate", score: 10 },
    { id: "a", trust_level: "core", score: 0 },
    { id: "c", trust_level: "core", score: 5 },
  ];
  const s = stableSortPoolForRanking(rows);
  assertEquals(s.map((r) => r.id).join(","), "c,a,b");
});

Deno.test("compareScoredForSlot: with composite, core beats candidate at similar slot-fit", () => {
  const base = (id: string, trust: string, slotAfter: number): ScoredCandidateRow => ({
    r: { id, title: id, familiarity: "adapted", trust_level: trust },
    finalScoreAfterCultural: slotAfter,
    goalBonus: 0,
    ageBonus: 0,
    softBonus: 0,
    culturalBonus: 0,
    baseScore: slotAfter,
    finalBeforeCultural: slotAfter,
    trustTier: 0,
    trustRankingBonus: trustRankingBonus(trust),
    dbScoreContribution: 0,
    explorationBoost: 0,
    rankJitter: 0,
    compositeWithCultural: slotAfter + trustRankingBonus(trust),
    compositeWithoutCultural: slotAfter + trustRankingBonus(trust),
  });
  const cand = base("c1", "candidate", 50);
  const core = base("k1", "core", 45);
  const sorted = [cand, core].sort((a, b) => compareScoredForSlot(a, b, "with_cultural"));
  assertEquals(sorted[0]!.r.id, "k1");
});

Deno.test("compareScoredForSlot: same trust, higher db contribution wins", () => {
  const slot = 30;
  const trust = "trusted";
  const tb = trustRankingBonus(trust);
  const low: ScoredCandidateRow = {
    r: { id: "low", title: "low", familiarity: "adapted", trust_level: trust },
    finalScoreAfterCultural: slot,
    goalBonus: 0,
    ageBonus: 0,
    softBonus: 0,
    culturalBonus: 0,
    baseScore: slot,
    finalBeforeCultural: slot,
    trustTier: 0,
    compositeWithCultural: slot + tb + dbScoreContribution(0),
    compositeWithoutCultural: slot + tb + dbScoreContribution(0),
  };
  const high: ScoredCandidateRow = {
    ...low,
    r: { id: "high", title: "high", familiarity: "adapted", trust_level: trust },
    compositeWithCultural: slot + tb + dbScoreContribution(20),
    compositeWithoutCultural: slot + tb + dbScoreContribution(20),
  };
  const sorted = [low, high].sort((a, b) => compareScoredForSlot(a, b, "with_cultural"));
  assertEquals(sorted[0]!.r.id, "high");
});

Deno.test("exploration boost: candidate with boost beats peer candidate without (same trust)", () => {
  const slot = 40;
  const trustC = "candidate";
  const tbC = trustRankingBonus(trustC);
  const withExpl: ScoredCandidateRow = {
    r: { id: "c_exp", title: "c_exp", familiarity: "adapted", trust_level: trustC },
    finalScoreAfterCultural: slot,
    goalBonus: 0,
    ageBonus: 0,
    softBonus: 0,
    culturalBonus: 0,
    baseScore: slot,
    finalBeforeCultural: slot,
    trustTier: 2,
    explorationBoost: EXPLORATION_CANDIDATE_BOOST,
    rankJitter: 0,
    compositeWithCultural: slot + tbC + dbScoreContribution(0) + EXPLORATION_CANDIDATE_BOOST,
    compositeWithoutCultural: slot + tbC + dbScoreContribution(0) + EXPLORATION_CANDIDATE_BOOST,
  };
  const plain: ScoredCandidateRow = {
    ...withExpl,
    r: { id: "c_plain", title: "c_plain", familiarity: "adapted", trust_level: trustC },
    explorationBoost: 0,
    compositeWithCultural: slot + tbC + dbScoreContribution(0),
    compositeWithoutCultural: slot + tbC + dbScoreContribution(0),
  };
  const sorted = [plain, withExpl].sort((a, b) => compareScoredForSlot(a, b, "with_cultural"));
  assertEquals(sorted[0]!.r.id, "c_exp");
});
