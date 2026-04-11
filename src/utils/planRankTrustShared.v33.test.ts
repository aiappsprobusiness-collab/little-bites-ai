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

/**
 * Модель «прироста» в финальном composite (не в БД):
 * один и тот же candidate, один slotFit/salt/jitter, сравнение mode=infant (legacy) vs mode=adult (v3.3).
 */
describe("v3.3: моделирование прироста composite для candidate к same slotFit", () => {
  const salt = "model-v33|pool|rank";
  const jitter = 0;
  const explorationPct = 25;
  const slotFit = 22;

  function legacyComposite(score: number, recipeId: string): number {
    return computeCompositeScore({
      slotFit,
      trustLevel: "candidate",
      score,
      recipeId,
      rankSalt: salt,
      jitterOverride: jitter,
      mode: "infant",
    });
  }

  function adultV33Composite(score: number, recipeId: string): number {
    return computeCompositeScore({
      slotFit,
      trustLevel: "candidate",
      score,
      recipeId,
      rankSalt: salt,
      jitterOverride: jitter,
      mode: "adult",
      explorationThresholdPct: explorationPct,
    });
  }

  it.each([
    { score: 6, label: "score=6 (порог «сильного» candidate в спеке)" },
    { score: 6.5, label: "score=6.5" },
    { score: 10, label: "score=10" },
    { score: 20, label: "score=20 (emerging cap)" },
  ])("adult > legacy для candidate $label", ({ score }) => {
    const rid = `cand-${score}`;
    const leg = legacyComposite(score, rid);
    const adv = adultV33Composite(score, rid);
    expect(adv).toBeGreaterThan(leg);
    const delta = adv - leg;
    expect(delta).toBeGreaterThan(0);
    // При score>=4 есть emerging; при score>0 — множитель db
    const baseDb = dbScoreContribution(score);
    const expectedMinLift = (baseDb * 1.4 - baseDb) + (score >= 4 ? Math.min(1, score * 0.05) : 0);
    expect(delta).toBeCloseTo(expectedMinLift, 5);
  });

  it("trusted: adult без множителя к db — прирост 0 относительно legacy при том же exploration", () => {
    const recipeId = "trusted-same";
    const score = 15;
    const leg = computeCompositeScore({
      slotFit,
      trustLevel: "trusted",
      score,
      recipeId,
      rankSalt: salt,
      jitterOverride: jitter,
      mode: "infant",
    });
    const adv = computeCompositeScore({
      slotFit,
      trustLevel: "trusted",
      score,
      recipeId,
      rankSalt: salt,
      jitterOverride: jitter,
      mode: "adult",
      explorationThresholdPct: explorationPct,
    });
    expect(adv).toBe(leg);
  });

  it("candidate score<=0: множитель 1.4 к db не применяется; при score<4 без emerging", () => {
    const rid = "cand-low";
    const leg = legacyComposite(0, rid);
    const adv = adultV33Composite(0, rid);
    const legNeg = legacyComposite(-1, rid);
    const advNeg = adultV33Composite(-1, rid);
    const base0 = dbScoreContribution(0);
    const baseNeg = dbScoreContribution(-1);
    expect(adv - leg).toBeCloseTo(0, 10);
    expect(advNeg - legNeg).toBeCloseTo(0, 10);
    expect(base0).toBe(0);
    expect(baseNeg).toBeLessThan(0);
  });
});
