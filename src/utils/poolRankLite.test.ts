import { describe, expect, it } from "vitest";
import {
  EXPLORATION_CANDIDATE_BOOST,
  isPoolTrustEligible,
  trustRankingBonus,
} from "@shared/planRankTrustShared";
import { computeSlotFitForPoolRow } from "@/utils/recipePool";
import { pickFromPoolRankingLite, type PoolRankLiteRow } from "@/utils/poolRankLite";

/** Убирает разброс jitter в тестах порядка. */
const noJitter = (): number => 0;

describe("isPoolTrustEligible", () => {
  it("excludes blocked", () => {
    expect(isPoolTrustEligible("blocked")).toBe(false);
    expect(isPoolTrustEligible("BLOCKED")).toBe(false);
  });
  it("allows null and candidate", () => {
    expect(isPoolTrustEligible(null)).toBe(true);
    expect(isPoolTrustEligible("candidate")).toBe(true);
    expect(isPoolTrustEligible("core")).toBe(true);
  });
});

describe("pickFromPoolRankingLite", () => {
  it("does not pick blocked", () => {
    const rows: PoolRankLiteRow[] = [
      { id: "b", title: "b", trust_level: "blocked", score: 100 },
      { id: "c", title: "c", trust_level: "candidate", score: 0 },
    ];
    const out = pickFromPoolRankingLite(rows, {
      rankSalt: "t|salt",
      rankJitterForRecipeId: noJitter,
      getSlotFit: () => 20,
      ageMonths: 6,
    });
    expect(out?.row.id).toBe("c");
  });

  it("ranks core above candidate when slot-fit and score equal (jitter off)", () => {
    const rows: PoolRankLiteRow[] = [
      { id: "c", title: "c", trust_level: "candidate", score: 10 },
      { id: "k", title: "k", trust_level: "core", score: 10 },
    ];
    const out = pickFromPoolRankingLite(rows, {
      rankSalt: "no-explore-zzzz|m|breakfast",
      rankJitterForRecipeId: noJitter,
      getSlotFit: () => 15,
      ageMonths: 6,
    });
    expect(out?.row.id).toBe("k");
  });

  it("prefers higher recipes.score when trust matches", () => {
    const rows: PoolRankLiteRow[] = [
      { id: "low", title: "low", trust_level: "trusted", score: 0 },
      { id: "high", title: "high", trust_level: "trusted", score: 40 },
    ];
    const out = pickFromPoolRankingLite(rows, {
      rankSalt: "no-explore-zzzz|m|lunch",
      rankJitterForRecipeId: noJitter,
      getSlotFit: () => 10,
      ageMonths: 6,
    });
    expect(out?.row.id).toBe("high");
  });

  it("is deterministic with same salt and recipe ids (seeded jitter)", () => {
    const rows: PoolRankLiteRow[] = [
      { id: "a", title: "a", trust_level: "candidate", score: 5 },
      { id: "b", title: "b", trust_level: "candidate", score: 5 },
    ];
    const opts = {
      rankSalt: "u|snack|pool|2026-03-15",
      getSlotFit: () => 12,
    };
    const x = pickFromPoolRankingLite(rows, { ...opts, ageMonths: 6 });
    const y = pickFromPoolRankingLite(rows, { ...opts, ageMonths: 6 });
    expect(x?.row.id).toBe(y?.row.id);
    expect(x?.debug.winner_composite).toBe(y?.debug.winner_composite);
  });

  it("debug top3 includes composite parts", () => {
    const rows: PoolRankLiteRow[] = [{ id: "x", title: "x", trust_level: "core", score: 1 }];
    const out = pickFromPoolRankingLite(rows, {
      rankSalt: "d|k|dinner",
      rankJitterForRecipeId: noJitter,
      getSlotFit: () => 11,
      ageMonths: 6,
    });
    expect(out?.debug.top3[0]?.trust_bonus).toBe(trustRankingBonus("core"));
    expect(out?.debug.top3[0]?.composite).toBeGreaterThan(0);
  });
});

describe("parity trust bonuses with Edge shared module", () => {
  it("core slightly above trusted, gap to candidate moderate", () => {
    expect(trustRankingBonus("core")).toBeGreaterThan(trustRankingBonus("trusted"));
    expect(trustRankingBonus("trusted")).toBeGreaterThan(trustRankingBonus("candidate"));
    const gap = trustRankingBonus("core") - trustRankingBonus("candidate");
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(20);
  });
  it("exploration boost is modest", () => {
    expect(EXPLORATION_CANDIDATE_BOOST).toBeLessThanOrEqual(12);
  });
});

describe("computeSlotFitForPoolRow (12+ heuristic)", () => {
  it("gives quick recipes slightly higher fit", () => {
    const slow = computeSlotFitForPoolRow(
      { id: "1", title: "t", tags: null, description: null, cooking_time_minutes: 120, meal_type: "lunch" },
      { slotNorm: "lunch", memberData: { age_months: 24 } },
    );
    const quick = computeSlotFitForPoolRow(
      { id: "2", title: "t", tags: null, description: null, cooking_time_minutes: 15, meal_type: "lunch" },
      { slotNorm: "lunch", memberData: { age_months: 24 } },
    );
    expect(quick).toBeGreaterThan(slow);
  });
});
