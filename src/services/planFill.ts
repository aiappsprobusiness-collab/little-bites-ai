/**
 * Сервис автозаполнения плана дня (после создания члена семьи).
 * Использует тот же backend (Edge Function generate-plan, mode: upgrade), что и кнопка «Заполнить день».
 */

import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { invokeGeneratePlan } from "@/api/invokeGeneratePlan";
import { getRollingDayKeys } from "@/utils/dateRange";
import { formatLocalDate } from "@/utils/dateUtils";

const POOL_UPGRADE_TIMEOUT_MS = 150_000;

const JUST_CREATED_MEMBER_KEY = "justCreatedMemberId";
const JUST_CREATED_TTL_MS = 30_000;

interface JustCreatedPayload {
  id: string;
  at: number;
}

/** Установить флаг «только что создан член семьи» (TTL 30 с). Защита от двойного вызова. */
export function setJustCreatedMemberId(memberId: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(
    JUST_CREATED_MEMBER_KEY,
    JSON.stringify({ id: memberId, at: Date.now() } as JustCreatedPayload)
  );
}

/**
 * Прочитать и удалить флаг «только что создан член семьи».
 * Возвращает memberId, если флаг есть и TTL не истёк; иначе null.
 */
export function consumeJustCreatedMemberId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(JUST_CREATED_MEMBER_KEY);
  sessionStorage.removeItem(JUST_CREATED_MEMBER_KEY);
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as JustCreatedPayload;
    if (Date.now() - payload.at > JUST_CREATED_TTL_MS) return null;
    return payload.id ?? null;
  } catch {
    return null;
  }
}

export interface StartFillDayResult {
  ok?: boolean;
  filledSlotsCount?: number;
  totalSlots?: number;
  emptySlotsCount?: number;
  partial?: boolean;
}

/**
 * Запускает заполнение плана на сегодня для указанного члена семьи.
 * Вызывает ту же Edge Function (generate-plan, mode: upgrade, type: day), что и кнопка «Заполнить день».
 *
 * @param memberId — id члена семьи (members.id)
 * @returns результат заполнения или выбрасывает ошибку
 */
export async function startFillDay(memberId: string): Promise<StartFillDayResult> {
  const { data: { session: afterRefresh } } = await supabase.auth.refreshSession();
  const token = afterRefresh?.access_token;
  if (!token) throw new Error("Необходима авторизация");

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, name, age_months, allergies, likes, dislikes, type")
    .eq("id", memberId)
    .single();

  if (memberError || !member) {
    throw new Error("Профиль не найден");
  }

  const member_data = {
    name: member.name,
    age_months: member.age_months ?? undefined,
    allergies: Array.isArray(member.allergies) ? member.allergies : [],
    likes: Array.isArray((member as { likes?: string[] }).likes) ? (member as { likes?: string[] }).likes : [],
    dislikes: Array.isArray((member as { dislikes?: string[] }).dislikes) ? (member as { dislikes?: string[] }).dislikes : [],
  };

  const todayKey = formatLocalDate(new Date());
  const day_keys = getRollingDayKeys();

  const body: Record<string, unknown> = {
    mode: "upgrade",
    type: "day",
    member_id: memberId,
    member_data,
    day_key: todayKey,
    day_keys,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), POOL_UPGRADE_TIMEOUT_MS);

  try {
    const res = await invokeGeneratePlan(SUPABASE_URL, token, body, {
      label: "startFillDay",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      if (res.status === 429 && err?.code === "LIMIT_REACHED") {
        throw new Error("LIMIT_REACHED");
      }
      throw new Error(err?.error ?? `Ошибка: ${res.status}`);
    }

    const data = (await res.json()) as StartFillDayResult;
    return data;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Подбор занял слишком много времени. Попробуйте ещё раз.");
    }
    throw e;
  }
}

/** URL плана на сегодня для члена семьи (для редиректа после создания). */
export function getPlanUrlForMember(memberId: string): string {
  const date = formatLocalDate(new Date());
  return `/meal-plan?memberId=${encodeURIComponent(memberId)}&date=${date}`;
}
