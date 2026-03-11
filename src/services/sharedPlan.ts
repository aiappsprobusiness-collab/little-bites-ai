/**
 * Шаринг плана дня и недели: создание short link /p/:ref и получение по ref для landing.
 */

import { supabase } from "@/integrations/supabase/client";
import { generateShareRef } from "@/utils/usageEvents";
import { formatLocalDate } from "@/utils/dateUtils";
import { getRolling7Dates, getRollingDayKeys } from "@/utils/dateRange";

const SHARE_PLAN_BASE = "https://momrecipes.online";

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  snack: "Полдник",
  dinner: "Ужин",
};

type MealsSlot = { recipe_id?: string; title?: string; servings?: number };
type MealsJson = Record<string, MealsSlot | undefined>;

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

/**
 * Создаёт share план для текущего range (today/week) и memberId, возвращает URL.
 * Используется в Shopping List для кнопки «Поделиться» (тот же flow, что и шаринг из вкладки Plan).
 */
export async function getSharedPlanUrlForRange(
  userId: string,
  memberId: string | null,
  range: "today" | "week"
): Promise<string> {
  const startDate = new Date();
  const endDate = range === "today" ? startDate : new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000);
  const startStr = formatLocalDate(startDate);
  const endStr = formatLocalDate(endDate);

  let planQuery = supabase
    .from("meal_plans_v2")
    .select("planned_date, meals")
    .eq("user_id", userId)
    .gte("planned_date", startStr)
    .lte("planned_date", endStr);
  if (memberId === null) planQuery = planQuery.is("member_id", null);
  else if (memberId) planQuery = planQuery.eq("member_id", memberId);

  const { data: planRows, error } = await planQuery.order("planned_date", { ascending: true });
  if (error) throw error;
  const rows = (planRows ?? []) as { planned_date: string; meals?: MealsJson }[];

  if (range === "today") {
    const row = rows.find((r) => r.planned_date === startStr) ?? { planned_date: startStr, meals: {} };
    const meals = (row.meals ?? {}) as MealsJson;
    const mealsList = ["breakfast", "lunch", "snack", "dinner"]
      .filter((mealType) => meals[mealType]?.recipe_id)
      .map((mealType) => ({
        meal_type: mealType,
        label: MEAL_TYPE_LABELS[mealType] ?? mealType,
        title: meals[mealType]?.title ?? "Блюдо",
      }));
    const payload: SharedPlanPayloadDay = { date: startStr, meals: mealsList };
    const { url } = await createSharedPlan(userId, memberId, payload);
    return url;
  }

  const rollingDates = getRolling7Dates();
  const dayKeys = getRollingDayKeys();
  const days = dayKeys.map((dayKey, i) => {
    const row = rows.find((r) => r.planned_date === dayKey);
    const meals = (row?.meals ?? {}) as MealsJson;
    const mealsList = ["breakfast", "lunch", "snack", "dinner"]
      .filter((mealType) => meals[mealType]?.recipe_id)
      .map((mealType) => ({
        slot: mealType,
        title: meals[mealType]?.title ?? "Блюдо",
      }));
    const date = rollingDates[i];
    const label = date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
    const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
    return { date: dayKey, label: capitalized, meals: mealsList };
  });
  const payload: SharedPlanPayloadWeek = {
    type: "week",
    startDate: dayKeys[0],
    endDate: dayKeys[6],
    days,
  };
  const { url } = await createSharedPlan(userId, memberId, payload);
  return url;
}
