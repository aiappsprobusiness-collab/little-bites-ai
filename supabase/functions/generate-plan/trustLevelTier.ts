/**
 * Уровни доверия пула для generate-plan: порядок сортировки и ключи метрик.
 * Этап trust_level=core: curated seed-каталог; trusted — поведенчески; без изменения формул скоринга слота.
 */

/** Меньше = выше приоритет при равном прочем (tie-break после shuffle). */
export function trustOrder(t: string | null | undefined): number {
  if (t === "trusted") return 0;
  if (t === "core" || t === "starter" || t === "seed") return 1;
  return 2;
}

/** Ключи для логов/агрегатов CHAT_PLAN_CULTURAL_* и отладки. */
export function trustLevelKeyForMetrics(t: string | null | undefined): string {
  if (t === "trusted") return "trusted";
  if (t === "core") return "core";
  if (t === "starter" || t === "seed") return "starter_or_seed";
  return "candidate_or_null";
}
