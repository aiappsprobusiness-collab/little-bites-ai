import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { getRollingStartKey, getRollingDayKeys } from "@/utils/dateRange";
import { formatLocalDate } from "@/utils/dateUtils";
import { isDebugPlanEnabled, isGeneratePlanDebugEnabled } from "@/utils/debugPlan";
import { invokeGeneratePlan } from "@/api/invokeGeneratePlan";
import { useAppStore } from "@/store/useAppStore";
import { getLimitReachedTitle, getLimitReachedMessage } from "@/utils/limitReachedMessages";

export type PlanGenerationType = "day" | "week";

export interface PlanGenerationJobRow {
  id: string;
  user_id: string;
  member_id: string | null;
  type: PlanGenerationType;
  status: "running" | "done" | "error";
  progress_total: number;
  progress_done: number;
  last_day_key: string | null;
  error_text: string | null;
  created_at: string;
  updated_at: string;
}

const POLL_FAST_MS = 800;
const POLL_NORMAL_MS = 1800;
const POLL_SLOW_MS = 3000;
const POLL_VERY_SLOW_MS = 6000;
const POLL_FAST_UNTIL_MS = 10_000;
const POLL_SLOW_AFTER_MS = 60_000;
const LONG_RUN_WARN_DAY_MS = 3 * 60 * 1000;
const LONG_RUN_WARN_WEEK_MS = 6 * 60 * 1000;
const JOB_STORAGE_PREFIX = "plan_job:";
const MAX_CONTINUE_ATTEMPTS = 5;
const CONTINUE_BACKOFF_MS = 400;

function getPollInterval(elapsedMs: number, type: "day" | "week"): number {
  if (elapsedMs < POLL_FAST_UNTIL_MS) return POLL_FAST_MS;
  if (elapsedMs < POLL_SLOW_AFTER_MS) return POLL_NORMAL_MS;
  if (elapsedMs < (type === "week" ? LONG_RUN_WARN_WEEK_MS : LONG_RUN_WARN_DAY_MS)) return POLL_SLOW_MS;
  return POLL_VERY_SLOW_MS;
}

export function getStoredJobKey(userId: string, memberId: string | null, startKey: string): string {
  return `${JOB_STORAGE_PREFIX}${userId}:${memberId ?? "family"}:${startKey}`;
}

export function getStoredJobId(userId: string, memberId: string | null, startKey: string): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(getStoredJobKey(userId, memberId, startKey));
}

export function setStoredJobId(userId: string, memberId: string | null, startKey: string, jobId: string | null): void {
  if (typeof localStorage === "undefined") return;
  const key = getStoredJobKey(userId, memberId, startKey);
  if (jobId) localStorage.setItem(key, jobId);
  else localStorage.removeItem(key);
}

async function fetchJob(
  userId: string,
  memberId: string | null,
  type: PlanGenerationType
): Promise<PlanGenerationJobRow | null> {
  let q = supabase
    .from("plan_generation_jobs")
    .select("id, user_id, member_id, type, status, progress_total, progress_done, last_day_key, error_text, created_at, updated_at")
    .eq("user_id", userId)
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(1);
  if (memberId == null) {
    q = q.is("member_id", null);
  } else {
    q = q.eq("member_id", memberId);
  }
  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  return data as PlanGenerationJobRow;
}

export interface StartPlanGenerationParams {
  type: PlanGenerationType;
  member_id: string | null;
  member_data: { name?: string; age_months?: number; allergies?: string[]; preferences?: string[]; likes?: string[]; dislikes?: string[] } | null;
  day_key?: string;
  start_key?: string;
  /** Явный массив ключей дней для week upgrade (приоритет над start_key). */
  day_keys?: string[];
  /** Включить debug-логи в Edge (для pool upgrade / run). */
  debug_pool?: boolean;
  /** Включить debug_plan (POOL DIAG / EXCLUDES). Если не задано, подставляется по isDebugPlanEnabled(). */
  debug_plan?: boolean;
}

export interface PoolUpgradeResult {
  ok?: boolean;
  replacedCount: number;
  unchangedCount: number;
  aiFallbackCount?: number;
  totalSlots: number;
  /** Частичное заполнение (таймаут или пул исчерпан). */
  partial?: boolean;
  filledSlotsCount?: number;
  emptySlotsCount?: number;
  filledDaysCount?: number;
  emptyDaysCount?: number;
  reason?: string;
}

export function usePlanGenerationJob(
  memberId: string | null,
  type: PlanGenerationType,
  options?: { enabled?: boolean }
) {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const enabled = options?.enabled !== false && !!user?.id;
  const continueAttemptsRef = useRef(0);
  const lastStartParamsRef = useRef<StartPlanGenerationParams | null>(null);
  const lastPartialKeyRef = useRef<string>("");

  const {
    data: job,
    isLoading: isLoadingJob,
    refetch: refetchJob,
  } = useQuery({
    queryKey: ["plan_generation_job", user?.id ?? "", memberId ?? "null", type],
    queryFn: () => (user?.id ? fetchJob(user.id, memberId, type) : Promise.resolve(null)),
    enabled,
    refetchInterval: (query) => {
      const j = query.state.data as PlanGenerationJobRow | null | undefined;
      if (j?.status !== "running") return false;
      const createdAt = j?.created_at ? new Date(j.created_at).getTime() : 0;
      const elapsedMs = createdAt ? Date.now() - createdAt : 0;
      return getPollInterval(elapsedMs, type);
    },
    refetchOnWindowFocus: true,
  });

  const POOL_UPGRADE_TIMEOUT_MS = 150_000; // 2.5 мин — Edge Function может долго обрабатывать неделю + AI fallback

  /** Получить актуальный access_token (при необходимости обновить сессию). */
  const getValidAccessToken = useCallback(async (): Promise<string> => {
    const { data: { session: afterRefresh } } = await supabase.auth.refreshSession();
    const token = afterRefresh?.access_token ?? session?.access_token;
    if (!token) throw new Error("Необходима авторизация");
    return token;
  }, [session?.access_token]);

  const runPoolUpgrade = useCallback(
    async (params: StartPlanGenerationParams): Promise<PoolUpgradeResult> => {
      if (!user?.id) throw new Error("Необходима авторизация");
      if (isGeneratePlanDebugEnabled() && params.member_id == null) {
        console.log("[generate-plan] member_id=null (профиль «Семья»)", { type: params.type });
      }
      const token = await getValidAccessToken();
      const body: Record<string, unknown> = {
        mode: "upgrade",
        type: params.type,
        member_id: params.member_id,
        member_data: params.member_data,
        ...(params.type === "day" && params.day_key && { day_key: params.day_key }),
        ...(params.type === "week" && {
          start_key: params.start_key ?? getRollingStartKey(),
          ...(Array.isArray(params.day_keys) && params.day_keys.length > 0 && { day_keys: params.day_keys }),
        }),
        ...(params.debug_pool && { debug_pool: true }),
        ...(params.debug_plan !== undefined ? { debug_plan: params.debug_plan } : isDebugPlanEnabled() ? { debug_plan: true } : {}),
      };
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), POOL_UPGRADE_TIMEOUT_MS);
      try {
        const res = await invokeGeneratePlan(SUPABASE_URL, token, body, {
          label: "runPoolUpgrade",
          signal: controller.signal,
          clientDebug: {
            selectedMemberId: params.member_id,
            weekStartDayKey: params.type === "week" ? (params.start_key ?? getRollingStartKey()) : undefined,
          },
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { code?: string; error?: string };
          if (res.status === 429 && err?.code === "LIMIT_REACHED") {
            useAppStore.getState().setPaywallReason("limit_plan_fill_day");
            useAppStore.getState().setPaywallCustomMessage(
              `${getLimitReachedTitle()}\n\n${getLimitReachedMessage("plan_fill_day")}`
            );
            useAppStore.getState().setShowPaywall(true);
          }
          throw new Error(err?.error ?? `Ошибка: ${res.status}`);
        }
        const data = (await res.json()) as PoolUpgradeResult;
        return data;
      } catch (e) {
        clearTimeout(timeoutId);
        if (e instanceof Error && e.name === "AbortError") {
          throw new Error("Подбор занял слишком много времени. Попробуйте ещё раз или выберите меньше дней.");
        }
        throw e;
      }
    },
    [user?.id, getValidAccessToken]
  );

  const continueGeneration = useCallback(
    async (jobRow: PlanGenerationJobRow) => {
      if (!user?.id || jobRow.type !== "week") return;
      const params = lastStartParamsRef.current;
      if (!params) return;
      const attempt = continueAttemptsRef.current;
      const token = await getValidAccessToken();
      const runBody: Record<string, unknown> = {
        action: "run",
        job_id: jobRow.id,
        type: "week" as const,
        member_id: params.member_id,
        member_data: params.member_data,
        start_key: params.start_key ?? getRollingStartKey(),
        continueFromDayIndex: jobRow.progress_done ?? 0,
        ...(params.debug_pool && { debug_pool: true }),
        ...(params.debug_plan !== undefined ? { debug_plan: params.debug_plan } : isDebugPlanEnabled() ? { debug_plan: true } : {}),
      };
      const res = await invokeGeneratePlan(SUPABASE_URL, token, runBody, {
        label: `continue (attempt ${attempt})`,
        clientDebug: {
          selectedMemberId: params.member_id,
          jobId: jobRow.id,
          continueFromDayIndex: jobRow.progress_done ?? 0,
          attempt,
        },
      });
      if (res.ok) {
        const json = (await res.json()) as { filledSlotsCount?: number; emptySlotsCount?: number; partial?: boolean; reason?: string };
        if (isGeneratePlanDebugEnabled()) {
          console.log(
            `[generate-plan] autodrive attempt ${attempt}: filledSlotsCount=${json.filledSlotsCount ?? "?"} emptySlotsCount=${json.emptySlotsCount ?? "?"} partial=${json.partial ?? "?"} reason=${json.reason ?? "-"}`
          );
        }
        refetchJob();
      }
    },
    [user?.id, getValidAccessToken, refetchJob]
  );

  useEffect(() => {
    const j = job;
    if (!j || j.status !== "done" || j.type !== "week") return;
    if (j.error_text !== "partial:time_budget") return;
    if (continueAttemptsRef.current >= MAX_CONTINUE_ATTEMPTS) return;
    const partialKey = `${j.id}-${j.progress_done ?? 0}`;
    if (lastPartialKeyRef.current === partialKey) return;
    lastPartialKeyRef.current = partialKey;
    continueAttemptsRef.current += 1;
    const t = setTimeout(() => {
      continueGeneration(j).catch(() => {});
    }, CONTINUE_BACKOFF_MS);
    return () => clearTimeout(t);
  }, [job?.id, job?.status, job?.error_text, job?.progress_done, job?.type, continueGeneration]);

  const startGeneration = useCallback(
    async (params: StartPlanGenerationParams): Promise<void | { blocked: true; reason: string }> => {
      if (!user?.id) return;
      if (isGeneratePlanDebugEnabled() && params.member_id == null) {
        console.log("[generate-plan] member_id=null (профиль «Семья»)", { type: params.type });
      }
      continueAttemptsRef.current = 0;
      lastPartialKeyRef.current = "";
      lastStartParamsRef.current = params;
      const token = await getValidAccessToken();
      const weekStartDayKey = params.type === "week" ? (params.start_key ?? getRollingStartKey()) : undefined;

      const startBody: Record<string, unknown> = {
        action: "start",
        type: params.type,
        member_id: params.member_id,
        member_data: params.member_data,
        ...(params.type === "day" && params.day_key && { day_key: params.day_key }),
        ...(params.type === "week" && { start_key: params.start_key ?? getRollingStartKey() }),
        ...(params.debug_plan !== undefined ? { debug_plan: params.debug_plan } : isDebugPlanEnabled() ? { debug_plan: true } : {}),
      };
      const startRes = await invokeGeneratePlan(SUPABASE_URL, token, startBody, {
        label: "start",
        clientDebug: { selectedMemberId: params.member_id, type: params.type, weekStartDayKey },
      });
      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `Ошибка: ${startRes.status}`);
      }
      const startData = (await startRes.json()) as { job_id?: string; status?: string };
      const jobId = startData.job_id;
      if (!jobId) throw new Error("Нет job_id в ответе");

      refetchJob();

      const startKey = params.type === "week" ? (params.start_key ?? getRollingStartKey()) : params.day_key ?? "";
      if (user?.id && startKey) setStoredJobId(user.id, params.member_id, startKey, jobId);
      const runBody: Record<string, unknown> = {
        action: "run",
        job_id: jobId,
        type: params.type,
        member_id: params.member_id,
        member_data: params.member_data,
        ...(params.type === "day" && params.day_key && { day_key: params.day_key }),
        ...(params.type === "week" && { start_key: params.start_key ?? getRollingStartKey() }),
        ...(params.debug_pool && { debug_pool: true }),
        ...(params.debug_plan !== undefined ? { debug_plan: params.debug_plan } : isDebugPlanEnabled() ? { debug_plan: true } : {}),
      };
      const runRes = await invokeGeneratePlan(SUPABASE_URL, token, runBody, {
        label: "run",
        clientDebug: { selectedMemberId: params.member_id, jobId, weekStartDayKey },
      });
      if (!runRes.ok && runRes.status === 429) {
        const errData = (await runRes.json().catch(() => ({}))) as { code?: string };
        if (errData?.code === "LIMIT_REACHED") {
          useAppStore.getState().setPaywallReason("limit_plan_fill_day");
          useAppStore.getState().setPaywallCustomMessage(
            `${getLimitReachedTitle()}\n\n${getLimitReachedMessage("plan_fill_day")}`
          );
          useAppStore.getState().setShowPaywall(true);
        }
      }
    },
    [user?.id, getValidAccessToken, refetchJob]
  );

  const cancelJob = useCallback(
    async () => {
      if (!user?.id || !job?.id || job.status !== "running") return;
      const token = await getValidAccessToken().catch(() => null);
      if (!token) return;
      const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/generate-plan`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "cancel", job_id: job.id }),
      });
      if (res.ok) {
        const clearKey = type === "week" ? getRollingStartKey() : (job.last_day_key ?? "");
        if (clearKey) setStoredJobId(user.id, memberId, clearKey, null);
        refetchJob();
      }
    },
    [user?.id, job?.id, job?.status, job?.last_day_key, memberId, type, getValidAccessToken, refetchJob]
  );

  const isRunning = job?.status === "running";
  const progressDone = job?.progress_done ?? 0;
  const progressTotal = job?.progress_total ?? 0;
  const errorText = job?.status === "error" ? (job.error_text ?? "Ошибка генерации") : null;
  const isPartialTimeBudget = job?.status === "done" && job?.error_text === "partial:time_budget";

  return {
    job,
    isLoadingJob,
    isRunning,
    progressDone,
    progressTotal,
    errorText,
    isPartialTimeBudget,
    startGeneration,
    runPoolUpgrade,
    cancelJob,
    refetchJob,
  };
}
