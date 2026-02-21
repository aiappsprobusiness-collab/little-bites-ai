/**
 * Единая точка вызова Edge Function generate-plan с опциональным логированием в консоль.
 * Дебаг: localStorage DEBUG_PLAN="1" или ?debugPlan=1.
 */

import { isGeneratePlanDebugEnabled } from "@/utils/debugPlan";

const GENERATE_PLAN_URL_SUFFIX = "/functions/v1/generate-plan";

export interface InvokeGeneratePlanOptions {
  /** Метка для лога (например "start" / "run" / "runPoolUpgrade" / "continue"). */
  label?: string;
  /** Данные для body.clientDebug при debug (selectedMemberId, weekStartDayKey и т.д.). */
  clientDebug?: Record<string, unknown>;
  /** Опционально: AbortSignal для отмены запроса (например таймаут runPoolUpgrade). */
  signal?: AbortSignal;
}

/**
 * Вызывает generate-plan (POST). При включённом дебаге логирует payload и response в консоли.
 * Возвращает Promise<Response> — вызывающий код может await или fire-and-forget.
 */
export async function invokeGeneratePlan(
  baseUrl: string,
  token: string,
  body: Record<string, unknown>,
  options?: InvokeGeneratePlanOptions
): Promise<Response> {
  const debugEnabled = isGeneratePlanDebugEnabled();
  const label = options?.label ?? "request";

  if (debugEnabled) {
    const bodyWithDebug = {
      ...body,
      debug_plan: true,
      clientDebug: {
        ...options?.clientDebug,
        source: "plan_ui",
      },
    };
    console.groupCollapsed(`[generate-plan] payload (${label})`);
    console.log(bodyWithDebug);
    console.groupEnd();
    body = bodyWithDebug;
  }

  const url = `${baseUrl.replace(/\/$/, "")}${GENERATE_PLAN_URL_SUFFIX}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const fetchInit: RequestInit = { method: "POST", headers, body: JSON.stringify(body) };
  if (options?.signal) fetchInit.signal = options.signal;

  const fetchPromise = fetch(url, fetchInit);

  if (debugEnabled) {
    fetchPromise
      .then((res) => {
        const clone = res.clone();
        clone
          .json()
          .then((json: Record<string, unknown>) => {
            const filled = (json.filledSlotsCount as number) ?? (json.filledSlots as number);
            const total = (json.totalSlots as number) ?? 0;
            const filledDays = json.filledDaysCount ?? json.filledDays ?? "-";
            const partial = json.partial === true;
            const reason = (json.reason as string) ?? "";
            const requestId = (json.requestId as string) ?? (json.job_id as string) ?? "";
            console.groupCollapsed(`[generate-plan] response (${label})`);
            console.log(json);
            console.groupEnd();
            console.log(
              `[generate-plan] summary (${label}): filled=${filled ?? "?"}/${total || "?"} days=${filledDays} partial=${partial} reason=${reason || "-"} requestId=${requestId || "-"}`
            );
          })
          .catch(() => {});
        return res;
      })
      .catch(() => {});
  }

  return fetchPromise;
}

/** Проверка: можно ли вызывать generate-plan (member_id задан). */
export function isMemberIdValid(memberId: string | null | undefined): boolean {
  if (memberId == null) return false;
  if (typeof memberId === "string" && (memberId === "" || memberId === "null")) return false;
  return true;
}
