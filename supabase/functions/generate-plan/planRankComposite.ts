/**
 * Финальный composite-ranking для generate-plan (после eligibility-фильтров).
 * Числа и формулы — в shared/planRankTrustShared.ts.
 */

export {
  buildAlignedRankSalt,
  buildRankSalt,
  computeCompositeScore,
  dbScoreContribution,
  explainRankingTail,
  explorationPickActive,
  EXPLORATION_CANDIDATE_BOOST,
  EXPLORATION_PICK_THRESHOLD_PCT,
  isCandidateTrustLevel,
  isExplorationActive,
  isPoolTrustEligible,
  rankJitter,
  rankJitterFromSeed,
  RANK_JITTER_MAX,
  type RankableRecipeRef,
  type RankingInput,
  type RankingTailBreakdown,
  simpleRankSaltHash,
  stableSortPoolForRanking,
  trustOrder,
  trustRankingBonus,
} from "../../../shared/planRankTrustShared.ts";
