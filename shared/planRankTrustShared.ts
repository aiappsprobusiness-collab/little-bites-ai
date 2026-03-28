/**
 * Общий смысл ранжирования пула: Edge generate-plan и client poolRankLite.
 * Источник правды: trust / exploration / db contribution / composite / salt / jitter.
 * Формула feedback в БД и пороги candidate→trusted не меняются здесь.
 */

/** Доля слотов с exploration-boost для candidate / legacy null (детерминированно от salt). */
export const EXPLORATION_PICK_THRESHOLD_PCT = 15;

/**
 * Добавка к composite для candidate/null в «exploration»-слоте.
 */
export const EXPLORATION_CANDIDATE_BOOST = 10;

/** Макс. jitter (не должен перебивать trust+db при типичных значениях). */
export const RANK_JITTER_MAX = 2.5;

export type RankableRecipeRef = {
  id: string;
  trust_level?: string | null;
  score?: number | null;
};

/** Единый контракт для финального composite (Edge + client). */
export type RankingInput = {
  slotFit: number;
  trustLevel: string | null | undefined;
  score: number | null | undefined;
  recipeId: string;
  rankSalt: string;
  /**
   * Только для тестов Edge: иначе jitter = rankJitterFromSeed(rankSalt, recipeId).
   * В проде не передавать.
   */
  jitterOverride?: number;
};

/** Рецепты с trust_level = blocked в пул подбора не допускаются (фильтр до скоринга). */
export function isPoolTrustEligible(trustLevel: string | null | undefined): boolean {
  const t = trustLevel?.trim().toLowerCase();
  return t !== "blocked";
}

/** Меньше = выше приоритет при равном прочем (stable sort / tie-break). */
export function trustOrder(t: string | null | undefined): number {
  if (t === "trusted") return 0;
  if (t === "core" || t === "starter" || t === "seed") return 1;
  return 2;
}

export function trustRankingBonus(t: string | null | undefined): number {
  const x = t?.trim();
  if (x === "core") return 38;
  if (x === "trusted") return 36;
  if (x === "starter" || x === "seed") return 34;
  if (x === "candidate") return 26;
  if (x == null || x === "") return 26;
  return 25;
}

export function simpleRankSaltHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
}

export function explorationPickActive(salt: string, thresholdPct: number = EXPLORATION_PICK_THRESHOLD_PCT): boolean {
  if (salt.length === 0) return false;
  return simpleRankSaltHash(salt) % 100 < thresholdPct;
}

/** Синоним для доков/читаемости: то же, что explorationPickActive. */
export function isExplorationActive(salt: string, thresholdPct?: number): boolean {
  return explorationPickActive(salt, thresholdPct ?? EXPLORATION_PICK_THRESHOLD_PCT);
}

export function isCandidateTrustLevel(t: string | null | undefined): boolean {
  const x = t?.trim();
  return x === "candidate" || x === undefined || x === null || x === "";
}

export function dbScoreContribution(score: number | null | undefined): number {
  const s = score ?? 0;
  const v = s * 0.45;
  return Math.max(-4, Math.min(22, v));
}

/** Не для прод composite — только тесты или особый override. */
export function rankJitter(rng: () => number, max: number = RANK_JITTER_MAX): number {
  return rng() * max;
}

/**
 * Детерминированный jitter [0, max) от rankSalt + recipeId — одинаково на Edge и клиенте.
 */
export function rankJitterFromSeed(rankSalt: string, recipeId: string, max: number = RANK_JITTER_MAX): number {
  const h = simpleRankSaltHash(`${rankSalt}|jitter|${recipeId}`);
  const u = (h % 1_000_000) / 1_000_000;
  return u * max;
}

export type RankingTailBreakdown = {
  trustBonus: number;
  dbContribution: number;
  explorationBoost: number;
  jitter: number;
};

export function explainRankingTail(
  trustLevel: string | null | undefined,
  score: number | null | undefined,
  recipeId: string,
  rankSalt: string,
  jitterOverride?: number,
): RankingTailBreakdown {
  const explorationBoost =
    isExplorationActive(rankSalt) && isCandidateTrustLevel(trustLevel) ? EXPLORATION_CANDIDATE_BOOST : 0;
  const trustBonus = trustRankingBonus(trustLevel);
  const dbContribution = dbScoreContribution(score);
  const jitter = jitterOverride !== undefined ? jitterOverride : rankJitterFromSeed(rankSalt, recipeId);
  return { trustBonus, dbContribution, explorationBoost, jitter };
}

/** Composite после eligibility: slotFit + trust + db + exploration + jitter (единая формула). */
export function computeCompositeScore(input: RankingInput): number {
  const tail = explainRankingTail(
    input.trustLevel,
    input.score,
    input.recipeId,
    input.rankSalt,
    input.jitterOverride,
  );
  return (
    input.slotFit +
    tail.trustBonus +
    tail.dbContribution +
    tail.explorationBoost +
    tail.jitter
  );
}

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

/** Legacy: day|request|meal — fallback, если rank_salt не передан (тесты). */
export function buildRankSalt(parts: { day_key?: string; request_id?: string; meal_slot?: string }): string {
  return `${parts.day_key ?? ""}|${parts.request_id ?? ""}|${parts.meal_slot ?? ""}`;
}

/**
 * Соль, согласованная с клиентом (generate-plan передаёт rank_salt в planPickDebug).
 * pool: userId|mealType|pool[|dayKey][|variant]
 * replace: userId|mealType|replace|dayKey[|variant]
 */
export function buildAlignedRankSalt(
  ctx:
    | { kind: "pool"; userId: string; mealType: string; dayKey?: string; variant?: string }
    | { kind: "replace"; userId: string; mealType: string; dayKey: string; variant?: string },
): string {
  if (ctx.kind === "pool") {
    const day = ctx.dayKey != null && ctx.dayKey !== "" ? `|${ctx.dayKey}` : "";
    const v = ctx.variant ? `|${ctx.variant}` : "";
    return `${ctx.userId}|${ctx.mealType}|pool${day}${v}`;
  }
  const v = ctx.variant ? `|${ctx.variant}` : "";
  return `${ctx.userId}|${ctx.mealType}|replace|${ctx.dayKey}${v}`;
}
