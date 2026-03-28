/**
 * Финальный composite-ranking для generate-plan (после eligibility-фильтров).
 * trust_level + recipes.score + controlled exploration; формула feedback в БД не трогается.
 */

import { trustOrder } from "./trustLevelTier.ts";

/** Доля слотов, для которых включается boost кандидатов (детерминированно от salt). */
export const EXPLORATION_PICK_THRESHOLD_PCT = 15;

/** Добавка к composite для candidate/null в «exploration»-слоте. */
export const EXPLORATION_CANDIDATE_BOOST = 22;

/** Макс. jitter для разнообразия (не должен перебивать trust+db). */
export const RANK_JITTER_MAX = 2.5;

export type RankableRecipeRef = {
  id: string;
  trust_level?: string | null;
  score?: number | null;
};

export function simpleRankSaltHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
}

/** Детерминированно: ~EXPLORATION_PICK_THRESHOLD_PCT% слотов дают шанс кандидатам. */
export function explorationPickActive(salt: string, thresholdPct: number = EXPLORATION_PICK_THRESHOLD_PCT): boolean {
  if (salt.length === 0) return false;
  return simpleRankSaltHash(salt) % 100 < thresholdPct;
}

/** Candidate и legacy NULL — «низкий» trust-tier для exploration. */
export function isCandidateTrustLevel(t: string | null | undefined): boolean {
  const x = t?.trim();
  return x === "candidate" || x === undefined || x === null || x === "";
}

/**
 * Явные бонусы к финальному рангу (additive к slot-fit).
 * core чуть выше trusted; candidate заметно ниже каталога.
 */
export function trustRankingBonus(t: string | null | undefined): number {
  const x = t?.trim();
  if (x === "core") return 56;
  if (x === "trusted") return 48;
  if (x === "starter" || x === "seed") return 40;
  if (x === "candidate") return 8;
  if (x == null || x === "") return 10;
  return 9;
}

/** Вклад recipes.score (уже посчитанный в БД), умеренный clamp. */
export function dbScoreContribution(score: number | null | undefined): number {
  const s = score ?? 0;
  const v = s * 0.45;
  return Math.max(-4, Math.min(22, v));
}

export function rankJitter(rng: () => number, max: number = RANK_JITTER_MAX): number {
  return rng() * max;
}

/** Стабильный порядок до скоринга: trust tier → score desc → id (убирает shuffle-noise). */
export function stableSortPoolForRanking<T extends RankableRecipeRef>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => {
    const oa = trustOrder(a.trust_level);
    const ob = trustOrder(b.trust_level);
    if (oa !== ob) return oa - ob;
    const sa = a.score ?? 0;
    const sb = b.score ?? 0;
    if (sb !== sa) return sb - sa;
    return a.id.localeCompare(b.id);
  });
}

export function buildRankSalt(parts: { day_key?: string; request_id?: string; meal_slot?: string }): string {
  return `${parts.day_key ?? ""}|${parts.request_id ?? ""}|${parts.meal_slot ?? ""}`;
}
