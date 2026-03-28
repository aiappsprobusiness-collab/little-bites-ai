/**
 * Stage 4.4.3: диагностика cultural scoring — сравнение до/после без изменения боевой формулы.
 */
import {
  type CulturalFamiliarityCountKey,
  culturalFamiliarityCountKey,
} from "./culturalPlanScoring.ts";
import { trustLevelKeyForMetrics } from "./trustLevelTier.ts";

export { trustLevelKeyForMetrics };

/** Минимальные поля рецепта для сэмплов и сравнения. */
export type RecipeRowForCulturalDebug = {
  id: string;
  title: string;
  familiarity?: string | null;
  trust_level?: string | null;
};

export type ScoredCandidateRow = {
  r: RecipeRowForCulturalDebug;
  finalScoreAfterCultural: number;
  goalBonus: number;
  ageBonus: number;
  softBonus: number;
  culturalBonus: number;
  baseScore: number;
  finalBeforeCultural: number;
  trustTier: number;
  /** Composite rank (slot-fit + trust + db score + exploration + jitter); если задан — основной ключ сортировки в generate-plan. */
  compositeWithCultural?: number;
  compositeWithoutCultural?: number;
  trustRankingBonus?: number;
  dbScoreContribution?: number;
  explorationBoost?: number;
  rankJitter?: number;
};

export type CompactCandidateSnapshot = {
  id: string;
  title: string;
  familiarity: string | null;
  trust_level: string | null;
  final_before_cultural: number;
  final_after_cultural: number;
};

export type CulturalPickComparison = {
  winner_without_cultural: CompactCandidateSnapshot;
  winner_with_cultural: CompactCandidateSnapshot;
  changed_by_cultural: boolean;
  /** cultural bonus у фактического победителя (with path). */
  score_delta_for_winner: number;
  top_candidates_before_cultural: CompactCandidateSnapshot[];
  top_candidates_after_cultural: CompactCandidateSnapshot[];
};

/**
 * Сортировка кандидатов: при заданных composite* — по ним (generate-plan); иначе legacy trustTier → slot-fit → goal → age → soft → id.
 */
export function compareScoredForSlot(
  a: ScoredCandidateRow,
  b: ScoredCandidateRow,
  mode: "with_cultural" | "without_cultural",
): number {
  if (mode === "with_cultural" && a.compositeWithCultural != null && b.compositeWithCultural != null) {
    const d = b.compositeWithCultural - a.compositeWithCultural;
    if (Math.abs(d) > 1e-9) return d > 0 ? 1 : -1;
  }
  if (mode === "without_cultural" && a.compositeWithoutCultural != null && b.compositeWithoutCultural != null) {
    const d = b.compositeWithoutCultural - a.compositeWithoutCultural;
    if (Math.abs(d) > 1e-9) return d > 0 ? 1 : -1;
  }
  if (a.trustTier !== b.trustTier) return a.trustTier - b.trustTier;
  const scoreA = mode === "with_cultural" ? a.finalScoreAfterCultural : a.finalBeforeCultural;
  const scoreB = mode === "with_cultural" ? b.finalScoreAfterCultural : b.finalBeforeCultural;
  if (scoreB !== scoreA) return scoreB - scoreA;
  if (b.goalBonus !== a.goalBonus) return b.goalBonus - a.goalBonus;
  if (b.ageBonus !== a.ageBonus) return b.ageBonus - a.ageBonus;
  if (b.softBonus !== a.softBonus) return b.softBonus - a.softBonus;
  return a.r.id < b.r.id ? -1 : 1;
}

function sortScoredCopy(scored: ScoredCandidateRow[], mode: "with_cultural" | "without_cultural"): ScoredCandidateRow[] {
  return [...scored].sort((a, b) => compareScoredForSlot(a, b, mode));
}

function toSnapshot(row: ScoredCandidateRow): CompactCandidateSnapshot {
  return {
    id: row.r.id,
    title: row.r.title,
    familiarity: row.r.familiarity ?? null,
    trust_level: row.r.trust_level ?? null,
    final_before_cultural: row.finalBeforeCultural,
    final_after_cultural: row.finalScoreAfterCultural,
  };
}

const DEFAULT_TOP_N = 5;

export function buildCulturalPickComparison(
  scored: ScoredCandidateRow[],
  topN: number = DEFAULT_TOP_N,
): CulturalPickComparison | null {
  if (scored.length === 0) return null;
  const sortedBefore = sortScoredCopy(scored, "without_cultural");
  const sortedAfter = sortScoredCopy(scored, "with_cultural");
  const wBefore = sortedBefore[0]!;
  const wAfter = sortedAfter[0]!;
  const snapBefore = toSnapshot(wBefore);
  const snapAfter = toSnapshot(wAfter);
  const changed = wBefore.r.id !== wAfter.r.id;
  return {
    winner_without_cultural: snapBefore,
    winner_with_cultural: snapAfter,
    changed_by_cultural: changed,
    score_delta_for_winner: wAfter.culturalBonus,
    top_candidates_before_cultural: sortedBefore.slice(0, topN).map(toSnapshot),
    top_candidates_after_cultural: sortedAfter.slice(0, topN).map(toSnapshot),
  };
}

export type CulturalDisplacementCounters = {
  classic_over_specific_count: number;
  adapted_over_specific_count: number;
  classic_over_adapted_count: number;
  no_change_count: number;
};

export function bumpDisplacementCounters(
  counters: CulturalDisplacementCounters,
  beforeKey: CulturalFamiliarityCountKey,
  afterKey: CulturalFamiliarityCountKey,
  changed: boolean,
): void {
  if (!changed) {
    counters.no_change_count++;
    return;
  }
  if (beforeKey === "specific" && afterKey === "classic") counters.classic_over_specific_count++;
  else if (beforeKey === "specific" && afterKey === "adapted") counters.adapted_over_specific_count++;
  else if (beforeKey === "adapted" && afterKey === "classic") counters.classic_over_adapted_count++;
}

export type CulturalSummaryAccumulator = {
  total_picks: number;
  changed_by_cultural_count: number;
  winners_by_familiarity_before: Record<CulturalFamiliarityCountKey, number>;
  winners_by_familiarity_after: Record<CulturalFamiliarityCountKey, number>;
  winners_by_trust_before: Record<string, number>;
  winners_by_trust_after: Record<string, number>;
  total_cultural_bonus_of_winners: number;
  total_pool_counts_by_familiarity: Record<CulturalFamiliarityCountKey, number>;
  displacement: CulturalDisplacementCounters;
};

export function createEmptyCulturalSummaryAccumulator(): CulturalSummaryAccumulator {
  const z = (): Record<CulturalFamiliarityCountKey, number> => ({
    classic: 0,
    adapted: 0,
    specific: 0,
    other: 0,
  });
  return {
    total_picks: 0,
    changed_by_cultural_count: 0,
    winners_by_familiarity_before: z(),
    winners_by_familiarity_after: z(),
    winners_by_trust_before: {},
    winners_by_trust_after: {},
    total_cultural_bonus_of_winners: 0,
    total_pool_counts_by_familiarity: z(),
    displacement: {
      classic_over_specific_count: 0,
      adapted_over_specific_count: 0,
      classic_over_adapted_count: 0,
      no_change_count: 0,
    },
  };
}

export function accumulateCulturalSummary(
  acc: CulturalSummaryAccumulator,
  comparison: CulturalPickComparison,
  poolFamiliarityCounts: Record<CulturalFamiliarityCountKey, number>,
  culturalBonusOfWinner: number,
): void {
  acc.total_picks++;
  const beforeKey = culturalFamiliarityCountKey(comparison.winner_without_cultural.familiarity);
  const afterKey = culturalFamiliarityCountKey(comparison.winner_with_cultural.familiarity);
  acc.winners_by_familiarity_before[beforeKey]++;
  acc.winners_by_familiarity_after[afterKey]++;
  const tb = trustLevelKeyForMetrics(comparison.winner_without_cultural.trust_level);
  const ta = trustLevelKeyForMetrics(comparison.winner_with_cultural.trust_level);
  acc.winners_by_trust_before[tb] = (acc.winners_by_trust_before[tb] ?? 0) + 1;
  acc.winners_by_trust_after[ta] = (acc.winners_by_trust_after[ta] ?? 0) + 1;
  acc.total_cultural_bonus_of_winners += culturalBonusOfWinner;
  for (const k of ["classic", "adapted", "specific", "other"] as const) {
    acc.total_pool_counts_by_familiarity[k] += poolFamiliarityCounts[k] ?? 0;
  }
  if (comparison.changed_by_cultural) acc.changed_by_cultural_count++;
  bumpDisplacementCounters(acc.displacement, beforeKey, afterKey, comparison.changed_by_cultural);
}

export type CulturalSummaryPayload = {
  request_id: string;
  total_picks: number;
  changed_by_cultural_count: number;
  changed_by_cultural_rate: number;
  winners_by_familiarity_before: Record<CulturalFamiliarityCountKey, number>;
  winners_by_familiarity_after: Record<CulturalFamiliarityCountKey, number>;
  winners_by_trust_before: Record<string, number>;
  winners_by_trust_after: Record<string, number>;
  average_cultural_bonus_of_winners: number;
  total_pool_counts_by_familiarity: Record<CulturalFamiliarityCountKey, number>;
  displacement: CulturalDisplacementCounters;
};

export function finalizeCulturalSummary(
  acc: CulturalSummaryAccumulator,
  request_id: string,
): CulturalSummaryPayload {
  const rate = acc.total_picks > 0 ? acc.changed_by_cultural_count / acc.total_picks : 0;
  const avgBonus = acc.total_picks > 0 ? acc.total_cultural_bonus_of_winners / acc.total_picks : 0;
  return {
    request_id,
    total_picks: acc.total_picks,
    changed_by_cultural_count: acc.changed_by_cultural_count,
    changed_by_cultural_rate: rate,
    winners_by_familiarity_before: { ...acc.winners_by_familiarity_before },
    winners_by_familiarity_after: { ...acc.winners_by_familiarity_after },
    winners_by_trust_before: { ...acc.winners_by_trust_before },
    winners_by_trust_after: { ...acc.winners_by_trust_after },
    average_cultural_bonus_of_winners: avgBonus,
    total_pool_counts_by_familiarity: { ...acc.total_pool_counts_by_familiarity },
    displacement: { ...acc.displacement },
  };
}
