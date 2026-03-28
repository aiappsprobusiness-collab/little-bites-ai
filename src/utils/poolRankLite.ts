/**
 * Client pool ranking: тот же computeCompositeScore и rankSalt/jitter, что generate-plan.
 * slotFit — lite (recipePool.computeSlotFitForPoolRow), без полного Edge slot-fit.
 */

import {
  buildAlignedRankSalt,
  computeCompositeScore,
  explainRankingTail,
  explorationPickActive,
  isPoolTrustEligible,
  type RankingInput,
} from "@shared/planRankTrustShared";

export type { RankingInput };

export type PoolRankLiteRow = {
  id: string;
  title: string;
  trust_level?: string | null;
  score?: number | null;
};

export type PoolRankLitePickDebug = {
  winner_id: string;
  winner_title: string;
  winner_trust_level: string | null;
  winner_recipes_score: number | null;
  winner_slot_fit: number;
  winner_trust_bonus: number;
  winner_db_contribution: number;
  winner_exploration_boost: number;
  winner_rank_jitter: number;
  winner_composite: number;
  rank_salt: string;
  exploration_slot_active: boolean;
  top3: Array<{
    id: string;
    title: string;
    trust_level: string | null;
    recipes_score: number | null;
    slot_fit: number;
    trust_bonus: number;
    db_contribution: number;
    exploration_boost: number;
    rank_jitter: number;
    composite: number;
  }>;
};

function isRankDebugClient(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search);
  return q.get("rankDebug") === "1" || q.get("debugPool") === "1";
}

export type PickFromPoolRankingLiteOptions = {
  rankSalt: string;
  /** Slot-fit proxy — из recipePool.computeSlotFitForPoolRow. */
  getSlotFit: (row: PoolRankLiteRow) => number;
  /**
   * Только тесты: фиксированный jitter на рецепт; в проде не передавать
   * (jitter = rankJitterFromSeed(rankSalt, id)).
   */
  rankJitterForRecipeId?: (recipeId: string) => number;
};

/**
 * После eligibility: тот же composite, что на Edge (shared computeCompositeScore).
 */
export function pickFromPoolRankingLite(
  candidates: PoolRankLiteRow[],
  options: PickFromPoolRankingLiteOptions,
): { row: PoolRankLiteRow; debug: PoolRankLitePickDebug } | null {
  const eligible = candidates.filter((r) => isPoolTrustEligible(r.trust_level));
  if (eligible.length === 0) return null;

  const rankSalt = options.rankSalt;
  const exploreSlot = explorationPickActive(rankSalt);

  const scored = eligible.map((row) => {
    const slotFit = options.getSlotFit(row);
    const jitterOverride = options.rankJitterForRecipeId?.(row.id);
    const composite = computeCompositeScore({
      slotFit,
      trustLevel: row.trust_level,
      score: row.score,
      recipeId: row.id,
      rankSalt,
      jitterOverride,
    });
    const tail = explainRankingTail(row.trust_level, row.score, row.id, rankSalt, jitterOverride);
    return {
      row,
      slotFit,
      trust_bonus: tail.trustBonus,
      db_contribution: tail.dbContribution,
      exploration_boost: tail.explorationBoost,
      rank_jitter: tail.jitter,
      composite,
    };
  });

  scored.sort((a, b) => {
    if (b.composite !== a.composite) return b.composite - a.composite;
    return a.row.id.localeCompare(b.row.id);
  });

  const top = scored[0]!;
  const top3 = scored.slice(0, 3).map((s) => ({
    id: s.row.id,
    title: s.row.title,
    trust_level: s.row.trust_level ?? null,
    recipes_score: s.row.score ?? null,
    slot_fit: s.slotFit,
    trust_bonus: s.trust_bonus,
    db_contribution: s.db_contribution,
    exploration_boost: s.exploration_boost,
    rank_jitter: s.rank_jitter,
    composite: s.composite,
  }));

  if (import.meta.env.DEV && isRankDebugClient()) {
    console.log("RANK_DEBUG", {
      source: "poolRankLite",
      rank_salt: rankSalt,
      top3: top3.map((row) => ({
        recipeId: row.id,
        slotFit: row.slot_fit,
        trust_bonus: row.trust_bonus,
        score_contribution: row.db_contribution,
        exploration: row.exploration_boost,
        jitter: row.rank_jitter,
        total: row.composite,
      })),
    });
  }

  const debug: PoolRankLitePickDebug = {
    winner_id: top.row.id,
    winner_title: top.row.title,
    winner_trust_level: top.row.trust_level ?? null,
    winner_recipes_score: top.row.score ?? null,
    winner_slot_fit: top.slotFit,
    winner_trust_bonus: top.trust_bonus,
    winner_db_contribution: top.db_contribution,
    winner_exploration_boost: top.exploration_boost,
    winner_rank_jitter: top.rank_jitter,
    winner_composite: top.composite,
    rank_salt: rankSalt,
    exploration_slot_active: exploreSlot,
    top3,
  };

  return { row: top.row, debug };
}

export { buildAlignedRankSalt };
