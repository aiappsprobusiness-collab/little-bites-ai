import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { getRollingStartKey, getRollingDayKeys } from "@/utils/dateRange";
import { formatLocalDate } from "@/utils/dateUtils";

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
  member_data: { name?: string; age_months?: number; allergies?: string[]; preferences?: string[] } | null;
  day_key?: string;
  start_key?: string;
  /** Явный массив ключей дней для week upgrade (приоритет над start_key). */
  day_keys?: string[];
  /** Включить debug-логи в Edge (для pool upgrade / run). */
  debug_pool?: boolean;
}

export interface PoolUpgradeResult {
  replacedCount: number;
  unchangedCount: number;
  aiFallbackCount?: number;
  totalSlots: number;
}

export function usePlanGenerationJob(
  memberId: string | null,
  type: PlanGenerationType,
  options?: { enabled?: boolean }
) {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const enabled = options?.enabled !== false && !!user?.id;

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

  const runPoolUpgrade = useCallback(
    async (params: StartPlanGenerationParams): Promise<PoolUpgradeResult> => {
      if (!user?.id) throw new Error("Необходима авторизация");
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token ?? session?.access_token;
      if (!token) throw new Error("Необходима авторизация");
      const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/generate-plan`;
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const body = {
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
      };
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), POOL_UPGRADE_TIMEOUT_MS);
      try {
        const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? `Ошибка: ${res.status}`);
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
    [user?.id, session?.access_token]
  );

  const startGeneration = useCallback(
    async (params: StartPlanGenerationParams) => {
      if (!user?.id) return;
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token ?? session?.access_token;
      if (!token) throw new Error("Необходима авторизация");
      const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/generate-plan`;
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      const startBody = {
        action: "start",
        type: params.type,
        member_id: params.member_id,
        member_data: params.member_data,
        ...(params.type === "day" && params.day_key && { day_key: params.day_key }),
        ...(params.type === "week" && { start_key: params.start_key ?? getRollingStartKey() }),
      };
      const startRes = await fetch(url, { method: "POST", headers, body: JSON.stringify(startBody) });
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
      const runBody = {
        action: "run",
        job_id: jobId,
        type: params.type,
        member_id: params.member_id,
        member_data: params.member_data,
        ...(params.type === "day" && params.day_key && { day_key: params.day_key }),
        ...(params.type === "week" && { start_key: params.start_key ?? getRollingStartKey() }),
        ...(params.debug_pool && { debug_pool: true }),
      };
      fetch(url, { method: "POST", headers, body: JSON.stringify(runBody) }).catch(() => {});
    },
    [user?.id, session?.access_token, refetchJob]
  );

  const cancelJob = useCallback(
    async () => {
      if (!user?.id || !job?.id || job.status !== "running") return;
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token ?? session?.access_token;
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
    [user?.id, job?.id, job?.status, job?.last_day_key, memberId, type, session?.access_token, refetchJob]
  );

  const isRunning = job?.status === "running";
  const progressDone = job?.progress_done ?? 0;
  const progressTotal = job?.progress_total ?? 0;
  const errorText = job?.status === "error" ? (job.error_text ?? "Ошибка генерации") : null;

  return {
    job,
    isLoadingJob,
    isRunning,
    progressDone,
    progressTotal,
    errorText,
    startGeneration,
    runPoolUpgrade,
    cancelJob,
    refetchJob,
  };
}
