/**
 * Уровни доверия пула для generate-plan: метрики и логи.
 * Порядок tie-break trustOrder — shared/planRankTrustShared.ts (синхрон с клиентом).
 */

export { trustOrder } from "../../../shared/planRankTrustShared.ts";

/** Ключи для логов/агрегатов CHAT_PLAN_CULTURAL_* и отладки. */
export function trustLevelKeyForMetrics(t: string | null | undefined): string {
  if (t === "trusted") return "trusted";
  if (t === "core") return "core";
  if (t === "starter" || t === "seed") return "starter_or_seed";
  return "candidate_or_null";
}
