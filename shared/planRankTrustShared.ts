/**
 * Общий смысл ранжирования пула: Edge generate-plan и client poolRankLite.
 * Источник правды: trust / exploration / db contribution / composite / salt / jitter.
 * Формула feedback в БД и пороги candidate→trusted не меняются здесь.
 *
 * Ranking Enhancement v3.3: при `mode: 'adult'` — усиление candidate/emerging и adaptive exploration;
 * при `mode: 'infant'` или без `mode` — поведение как до v3.3 (legacy).
 */

/** Режим ранжирования плана по возрасту слота (per-slot). */
export type PlanRankingMode = "infant" | "adult";

/** Доля слотов с exploration-boost для candidate / legacy null (детерминированно от salt). */
export const EXPLORATION_PICK_THRESHOLD_PCT = 25;

/**
 * Мягкая добавка к composite только для `trust_level = candidate` (не для null/legacy).
 * Не перебивает приоритет core/trusted при типичных slot-fit; даёт чаще «шанс» в плотной середине.
 */
export const CANDIDATE_COMPOSITE_NUDGE = 0.05;

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
  /**
   * v3.3: `'adult'` — candidate boost / emerging / adaptive exploration.
   * Без `mode` или `'infant'` — legacy (как до v3.3), infant pipeline не меняется.
   */
  mode?: PlanRankingMode;
  /** v3.3 adult: порог % для explorationPickActive (25 или 35). Игнорируется в legacy/infant. */
  explorationThresholdPct?: number;
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

/** v3.3: candidate / NULL при положительном score — множитель к вкладу БД (без изменения колонки score). */
export function dbScoreContributionForRanking(
  score: number | null | undefined,
  trustLevel: string | null | undefined,
  mode: PlanRankingMode,
): number {
  const base = dbScoreContribution(score);
  if (mode !== "adult") return base;
  if (!isCandidateTrustForV33(trustLevel)) return base;
  if ((score ?? 0) <= 0) return base;
  return base * 1.4;
}

/** Candidate для правил v3.3: `candidate` или NULL (legacy). */
export function isCandidateTrustForV33(trustLevel: string | null | undefined): boolean {
  if (trustLevel === null || trustLevel === undefined) return true;
  const t = trustLevel.trim();
  if (t === "") return true;
  return t.toLowerCase() === "candidate";
}

export function isEstablishedTrust(trustLevel: string | null | undefined): boolean {
  const x = trustLevel?.trim().toLowerCase();
  return x === "trusted" || x === "core" || x === "seed" || x === "starter";
}

/** `age_months == null` → adult (спека v3.3). */
export function resolvePlanRankingMode(ageMonths: number | null | undefined): PlanRankingMode {
  if (ageMonths == null || !Number.isFinite(Number(ageMonths))) return "adult";
  return Math.max(0, Math.round(Number(ageMonths))) < 12 ? "infant" : "adult";
}

/**
 * Adaptive exploration (только adult): после фильтров слота.
 * Infant и пустой пул → 25%.
 */
export function computeExplorationThresholdPct(
  mode: PlanRankingMode,
  candidates: Array<{ trust_level?: string | null }>,
): number {
  const total = candidates.length;
  if (total === 0) return 25;
  if (mode === "infant") return 25;
  const established = candidates.reduce((n, c) => n + (isEstablishedTrust(c.trust_level) ? 1 : 0), 0);
  const ratio = established / total;
  return ratio >= 0.6 ? 25 : 35;
}

export function computeEmergingBoost(score: number | null | undefined): number {
  const s = score ?? 0;
  return Math.max(0, Math.min(1, s * 0.05));
}

export function isEmergingV33(trustLevel: string | null | undefined, score: number | null | undefined): boolean {
  return isCandidateTrustForV33(trustLevel) && (score ?? 0) >= 4;
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

/** v3.3 adult: exploration с заданным порогом %; вклад БД с множителем для candidate. */
export function explainRankingTailAdult(
  trustLevel: string | null | undefined,
  score: number | null | undefined,
  recipeId: string,
  rankSalt: string,
  explorationThresholdPct: number,
  jitterOverride?: number,
): RankingTailBreakdown {
  const explorationBoost =
    explorationPickActive(rankSalt, explorationThresholdPct) && isCandidateTrustLevel(trustLevel)
      ? EXPLORATION_CANDIDATE_BOOST
      : 0;
  const trustBonus = trustRankingBonus(trustLevel);
  const dbContribution = dbScoreContributionForRanking(score, trustLevel, "adult");
  const jitter = jitterOverride !== undefined ? jitterOverride : rankJitterFromSeed(rankSalt, recipeId);
  return { trustBonus, dbContribution, explorationBoost, jitter };
}

/** Поля хвоста без slotFit (для отладки и Edge/client). */
export type RankingTailInput = Pick<
  RankingInput,
  "trustLevel" | "score" | "recipeId" | "rankSalt" | "jitterOverride" | "mode" | "explorationThresholdPct"
>;

/**
 * Хвост ранжирования согласован с `computeCompositeScore` (legacy vs v3.3 adult).
 */
export function getRankingTailBreakdown(input: RankingTailInput): RankingTailBreakdown {
  const mode = input.mode;
  if (mode === undefined || mode === "infant") {
    return explainRankingTail(input.trustLevel, input.score, input.recipeId, input.rankSalt, input.jitterOverride);
  }
  const pct = input.explorationThresholdPct ?? 25;
  return explainRankingTailAdult(
    input.trustLevel,
    input.score,
    input.recipeId,
    input.rankSalt,
    pct,
    input.jitterOverride,
  );
}

/** Composite после eligibility: slotFit + trust + db + exploration + jitter (единая формула). */
export function computeCompositeScore(input: RankingInput): number {
  const mode = input.mode;
  if (mode === undefined || mode === "infant") {
    const tail = explainRankingTail(
      input.trustLevel,
      input.score,
      input.recipeId,
      input.rankSalt,
      input.jitterOverride,
    );
    let sum =
      input.slotFit +
      tail.trustBonus +
      tail.dbContribution +
      tail.explorationBoost +
      tail.jitter;
    if (input.trustLevel?.trim().toLowerCase() === "candidate") {
      sum += CANDIDATE_COMPOSITE_NUDGE;
    }
    return sum;
  }

  const explorationPct = input.explorationThresholdPct ?? 25;
  const tail = explainRankingTailAdult(
    input.trustLevel,
    input.score,
    input.recipeId,
    input.rankSalt,
    explorationPct,
    input.jitterOverride,
  );
  let sum =
    input.slotFit +
    tail.trustBonus +
    tail.dbContribution +
    tail.explorationBoost +
    tail.jitter;
  if (input.trustLevel?.trim().toLowerCase() === "candidate") {
    sum += CANDIDATE_COMPOSITE_NUDGE;
  }
  if (isEmergingV33(input.trustLevel, input.score)) {
    sum += computeEmergingBoost(input.score);
  }
  return sum;
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
 * pool: userId|mealType|pool[|dayKey][|variant][|rankEntropy]
 * replace: userId|mealType|replace|dayKey[|variant][|rankEntropy]
 *
 * `rankEntropy` — один на запуск job (`plan_generation_jobs.id` / `request_id` на Edge) или на клиентскую сессию;
 * без неё соль совпадает с прежним форматом (обратная совместимость тестов и старых вызовов).
 */
export function buildAlignedRankSalt(
  ctx:
    | { kind: "pool"; userId: string; mealType: string; dayKey?: string; variant?: string; rankEntropy?: string }
    | { kind: "replace"; userId: string; mealType: string; dayKey: string; variant?: string; rankEntropy?: string },
): string {
  const ent =
    ctx.rankEntropy != null && String(ctx.rankEntropy).trim() !== ""
      ? `|${String(ctx.rankEntropy).trim()}`
      : "";
  if (ctx.kind === "pool") {
    const day = ctx.dayKey != null && ctx.dayKey !== "" ? `|${ctx.dayKey}` : "";
    const v = ctx.variant ? `|${ctx.variant}` : "";
    return `${ctx.userId}|${ctx.mealType}|pool${day}${v}${ent}`;
  }
  const v = ctx.variant ? `|${ctx.variant}` : "";
  return `${ctx.userId}|${ctx.mealType}|replace|${ctx.dayKey}${v}${ent}`;
}
