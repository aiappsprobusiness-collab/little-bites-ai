/**
 * Шаринг плана дня и недели: создание short link /p/:ref и получение по ref для landing.
 */

import { supabase } from "@/integrations/supabase/client";
import { generateShareRef } from "@/utils/usageEvents";

const SHARE_PLAN_BASE = "https://momrecipes.online";

/** День: текущая структура (без type для обратной совместимости старых ссылок). */
export interface SharedPlanPayloadDay {
  date: string;
  meals: Array<{ meal_type: string; label?: string; title: string }>;
}

/** Неделя: type + период + массив дней (включая пустые). */
export interface SharedPlanPayloadWeek {
  type: "week";
  startDate: string;
  endDate: string;
  days: Array<{
    date: string;
    label: string;
    meals: Array<{ slot: string; title: string }>;
  }>;
}

export type SharedPlanPayload = SharedPlanPayloadDay | SharedPlanPayloadWeek;

export function isSharedPlanWeek(payload: SharedPlanPayload): payload is SharedPlanPayloadWeek {
  return "type" in payload && payload.type === "week";
}

export async function createSharedPlan(
  userId: string,
  memberId: string | null,
  payload: SharedPlanPayloadDay | SharedPlanPayloadWeek
): Promise<{ ref: string; url: string }> {
  let ref = generateShareRef();
  const maxAttempts = 5;
  for (let i = 0; i < maxAttempts; i++) {
    const { error } = await supabase.from("shared_plans").insert({
      ref,
      user_id: userId,
      member_id: memberId,
      payload,
    });
    if (!error) return { ref, url: `${SHARE_PLAN_BASE}/p/${ref}` };
    if (error.code === "23505") {
      ref = generateShareRef();
      continue;
    }
    throw error;
  }
  throw new Error("Не удалось создать ссылку");
}

export async function getSharedPlanByRef(ref: string): Promise<SharedPlanPayload | null> {
  const { data, error } = await supabase
    .from("shared_plans")
    .select("payload")
    .eq("ref", ref.trim())
    .maybeSingle();
  if (error || !data?.payload) return null;
  return data.payload as SharedPlanPayload;
}

export function getSharedPlanUrl(ref: string): string {
  return `${SHARE_PLAN_BASE}/p/${ref}`;
}
