import { describe, expect, it } from "vitest";
import {
  computeCompositeScore,
  computeExplorationThresholdPct,
  dbScoreContribution,
  explainRankingTail,
  resolvePlanRankingMode,
} from "@shared/planRankTrustShared";

const rid = "recipe-1";
const salt = "fixed-rank-salt-v33-test|pool|day";

describe("Ranking Enhancement v3.3 (shared)", () => {
  it("resolvePlanRankingMode: null/undefined → adult", () => {
    expect(resolvePlanRankingMode(null)).toBe("adult");
    expect(resolvePlanRankingMode(undefined)).toBe("adult");
  });

  it("resolvePlanRankingMode: <12 → infant, ≥12 → adult", () => {
    expect(resolvePlanRankingMode(11)).toBe("infant");
    expect(resolvePlanRankingMode(12)).toBe("adult");
  });

  it("infant parity: composite equals legacy (no mode / infant)", () => {
    const legacy = explainRankingTail("candidate", 8, rid, salt, 0);
    const withoutMode = computeCompositeScore({
      slotFit: 20,
      trustLevel: "candidate",
      score: 8,
      recipeId: rid,
      rankSalt: salt,
      jitterOverride: 0,
    });
    const infant = computeCompositeScore({
      slotFit: 20,
      trustLevel: "candidate",
      score: 8,
      recipeId: rid,
      rankSalt: salt,
      jitterOverride: 0,
      mode: "infant",
    });
    const nudge = 0.05; // CANDIDATE_COMPOSITE_NUDGE
    const expected =
      20 + legacy.trustBonus + legacy.dbContribution + legacy.explorationBoost + legacy.jitter + nudge;
    expect(withoutMode).toBe(expected);
    expect(infant).toBe(expected);
  });

  it("adult candidate with score ≥6 gets higher composite than legacy at same slotFit", () => {
    const slotFit = 25;
    const legacy = computeCompositeScore({
      slotFit,
      trustLevel: "candidate",
      score: 8,
      recipeId: rid,
      rankSalt: salt,
      jitterOverride: 0,
      mode: "infant",
    });
    const v33 = computeCompositeScore({
      slotFit,
      trustLevel: "candidate",
      score: 8,
      recipeId: rid,
      rankSalt: salt,
      jitterOverride: 0,
      mode: "adult",
      explorationThresholdPct: 25,
    });
    expect(v33).toBeGreaterThan(legacy);
  });

  it("trusted above candidate at equal slotFit (adult, same exploration pct)", () => {
    const slotFit = 30;
    const pct = 25;
    const trusted = computeCompositeScore({
      slotFit,
      trustLevel: "trusted",
      score: 10,
      recipeId: "t1",
      rankSalt: salt,
      jitterOverride: 0,
      mode: "adult",
      explorationThresholdPct: pct,
    });
    const cand = computeCompositeScore({
      slotFit,
      trustLevel: "candidate",
      score: 10,
      recipeId: "c1",
      rankSalt: salt,
      jitterOverride: 0,
      mode: "adult",
      explorationThresholdPct: pct,
    });
    expect(trusted).toBeGreaterThan(cand);
  });

  it("computeExplorationThresholdPct matches spec (adult)", () => {
    const empty = computeExplorationThresholdPct("adult", []);
    expect(empty).toBe(25);
    const low = computeExplorationThresholdPct("adult", [
      { trust_level: "candidate" },
      { trust_level: "candidate" },
    ]);
    expect(low).toBe(35);
    const high = computeExplorationThresholdPct("adult", [
      { trust_level: "candidate" },
      { trust_level: "candidate" },
      { trust_level: "trusted" },
      { trust_level: "core" },
      { trust_level: "core" },
    ]);
    expect(high).toBe(25);
  });

  it("adult candidate db contribution uses 1.4× only when score > 0", () => {
    const base = dbScoreContribution(10);
    const adultPos = computeCompositeScore({
      slotFit: 0,
      trustLevel: "candidate",
      score: 10,
      recipeId: rid,
      rankSalt: salt,
      jitterOverride: 0,
      mode: "adult",
      explorationThresholdPct: 25,
    });
    const infantSame = computeCompositeScore({
      slotFit: 0,
      trustLevel: "candidate",
      score: 10,
      recipeId: rid,
      rankSalt: salt,
      jitterOverride: 0,
      mode: "infant",
    });
    const emerging = Math.min(1, 10 * 0.05);
    expect(adultPos - infantSame).toBeCloseTo((base * 1.4 - base) + emerging, 5);
  });
});
