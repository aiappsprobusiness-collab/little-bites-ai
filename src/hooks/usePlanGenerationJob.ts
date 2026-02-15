import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { getRollingStartKey } from "@/utils/dateRange";
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

const JOB_POLL_MS = 2500;

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
      return j?.status === "running" ? JOB_POLL_MS : false;
    },
    refetchOnWindowFocus: true,
  });

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

      const runBody = {
        action: "run",
        job_id: jobId,
        type: params.type,
        member_id: params.member_id,
        member_data: params.member_data,
        ...(params.type === "day" && params.day_key && { day_key: params.day_key }),
        ...(params.type === "week" && { start_key: params.start_key ?? getRollingStartKey() }),
      };
      fetch(url, { method: "POST", headers, body: JSON.stringify(runBody) }).catch(() => {});
    },
    [user?.id, session?.access_token, refetchJob]
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
    refetchJob,
  };
}
