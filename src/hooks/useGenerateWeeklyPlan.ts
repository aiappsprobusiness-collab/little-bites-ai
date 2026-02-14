import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useRecipes } from "./useRecipes";
import { useMealPlans } from "./useMealPlans";
import { formatLocalDate } from "@/utils/dateUtils";
import { getRolling7Dates, getRollingStartKey, getRollingEndKey } from "@/utils/dateRange";
import { resolveUnit } from "@/utils/productUtils";
import { extractSingleJsonObject } from "@/utils/parseChatRecipes";

const DAY_ABBREV = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
import type { Tables } from "@/integrations/supabase/types";

type MemberData = {
  name?: string;
  birth_date?: string;
  age_months?: number;
  ageMonths?: number;
  allergies?: string[];
};

const DAY_NAMES = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];

const MEAL_KEYS = ["breakfast", "lunch", "snack", "dinner"] as const;

const IS_DEV = import.meta.env.DEV;

/** Накопленный контекст недели для разнообразия (передаётся в каждый следующий single_day). */
export interface WeekContextAccumulated {
  chosenTitles: string[];
  chosenBreakfastTitles: string[];
  chosenBreakfastBases: string[];
}

/** Эвристика базы завтрака по названию/ингредиентам (без ML). */
function classifyBreakfastBase(title: string, _ingredientsText?: string): string {
  const t = (title || "").toLowerCase();
  if (/овсян|oat/.test(t)) return "oatmeal";
  if (/омлет|яичниц|яйц/.test(t)) return "eggs";
  if (/творог|сырник|запеканк/.test(t)) return "cottage";
  if (/йогурт|гранол/.test(t)) return "yogurt";
  if (/бутер|тост|лаваш|сэндвич/.test(t)) return "sandwich";
  if (/гречк|рис\s|рисов|пшен|пшён/.test(t)) return "grain";
  if (/блин|оладь/.test(t)) return "pancakes";
  return "other";
}

/** Ингредиент от single_day: контракт [{ name, amount }] как в чате. */
interface SingleDayIngredient {
  name?: string;
  amount?: string;
}

interface SingleDayMeal {
  name?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  cooking_time?: number;
  /** Массив { name, amount } (amount строка: "100 g", "по вкусу"). Поддержка legacy: string[] → amount считается пустым. */
  ingredients?: SingleDayIngredient[] | string[];
  steps?: string[];
}

interface SingleDayResponse {
  breakfast?: SingleDayMeal;
  lunch?: SingleDayMeal;
  snack?: SingleDayMeal;
  dinner?: SingleDayMeal;
}

/** Нормализовать один ингредиент из ответа single_day в { name, amountStr }. Строку "X — 100 g" разбираем в name + amount. */
function normalizeSingleDayIngredient(ing: SingleDayIngredient | string): { name: string; amountStr: string } {
  if (typeof ing === "string") {
    const s = ing.trim();
    const dash = s.indexOf("—");
    if (dash > 0) {
      return { name: s.slice(0, dash).trim(), amountStr: s.slice(dash + 1).trim() };
    }
    return { name: s, amountStr: "" };
  }
  const name = (ing.name ?? "").trim() || "Ингредиент";
  const amount = typeof ing.amount === "string" ? ing.amount.trim() : "";
  return { name, amountStr: amount };
}

/** День недели для полного имени: 0 = Пн, 1 = Вт, ... (для DAY_NAMES). */
function getWeekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** Краткая подпись дня для прогресса: Пн, Вт, ... Сб, Вс. */
function getShortDayLabel(date: Date): string {
  return DAY_ABBREV[getWeekdayIndex(date)];
}

export function useGenerateWeeklyPlan(memberData: MemberData | null, memberId: string | null) {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const { createRecipe } = useRecipes();
  const { createMealPlan } = useMealPlans(memberId ?? undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const [completedDays, setCompletedDays] = useState<Record<number, boolean>>({});
  /** Ключи дней, которые сейчас генерируются (в т.ч. autofill одного дня). Для shimmer в табах. */
  const [generatingDayKeys, setGeneratingDayKeys] = useState<Set<string>>(new Set());
  /** Лок на запуск полной недели: не стартовать второй раз для того же (user, member, week). */
  const weekLockRef = useRef<Set<string>>(new Set());
  /** Прогресс генерации: current/total, подпись дня, индекс дня в rollingDates для shimmer. */
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    currentDayLabel: string;
    generatingDayIndex: number;
  } | null>(null);

  const generateSingleDay = useCallback(
    async (
      dayIndex: number,
      date: Date,
      dayName: string,
      token: string,
      weekContext?: WeekContextAccumulated | string
    ): Promise<SingleDayResponse | null> => {
      if (IS_DEV) {
        console.log("[DEBUG] single_day request: type=single_day dayName=%s hasMemberId=%s (no pool query on client)", dayName, !!memberId);
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/deepseek-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "single_day",
          stream: false,
          dayName,
          memberData,
          weekContext: weekContext ?? undefined,
          messages: [
            {
              role: "user",
              content: `Составь план питания на ${dayName}. Укажи завтрак, обед, полдник и ужин в формате JSON.`,
            },
          ],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || `Ошибка API: ${res.status}`);
      }

      const data = await res.json();
      const raw = data?.message ?? "";
      let parsed: SingleDayResponse = {};

      try {
        const jsonStr = extractSingleJsonObject(raw);
        if (jsonStr) {
          parsed = JSON.parse(jsonStr) as SingleDayResponse;
        }
      } catch {
        throw new Error("Не удалось распарсить ответ ИИ");
      }

      const dateStr = formatLocalDate(date);

      if (user?.id) {
        let existingQuery = supabase
          .from("meal_plans_v2")
          .select("id, meals")
          .eq("user_id", user.id)
          .eq("planned_date", dateStr);
        if (memberId == null) existingQuery = existingQuery.is("member_id", null);
        else existingQuery = existingQuery.eq("member_id", memberId);
        const { data: existingRow } = await existingQuery.maybeSingle();
        const existingMeals = (existingRow as { meals?: Record<string, unknown> } | null)?.meals ?? {};
        const hasMeals = typeof existingMeals === "object" && Object.keys(existingMeals).length > 0;
        if (hasMeals) {
          if (IS_DEV) {
            console.log("[DEBUG] skip day apply: plan already exists planned_date=%s", dateStr);
          }
          setCompletedDays((prev) => ({ ...prev, [dayIndex]: true }));
          return parsed;
        }
      }

      const generatedIds: string[] = [];

      for (const mealKey of MEAL_KEYS) {
        const meal = parsed[mealKey];
        if (!meal?.name || !Array.isArray(meal.ingredients)) continue;

        const normalizedIngredients = meal.ingredients.map((ing) => normalizeSingleDayIngredient(ing));

        const recipe = await createRecipe({
          source: 'week_ai',
          recipe: {
            title: meal.name,
            description: "",
            cooking_time_minutes: meal.cooking_time ?? null,
            member_id: memberId ?? null,
            child_id: memberId ?? null,
          },
          ingredients: normalizedIngredients.map(({ name, amountStr }, idx) => ({
            name,
            display_text: amountStr || null,
            amount: null,
            unit: resolveUnit(null, name),
            category: "other" as const,
            order_index: idx,
          })),
          steps: (meal.steps || []).map((step, idx) => ({
            instruction: typeof step === "string" ? step : String(step),
            step_number: idx + 1,
            duration_minutes: null,
            image_url: null,
          })),
        });

        await createMealPlan({
          child_id: memberId ?? null,
          member_id: memberId ?? null,
          recipe_id: recipe.id,
          planned_date: dateStr,
          meal_type: mealKey,
          is_completed: false,
          title: recipe.title,
        });
        generatedIds.push(recipe.id);
      }

      if (IS_DEV) {
        const selectedFromPoolCount = 0;
        const generatedCount = generatedIds.length;
        const idSuffixes = generatedIds.map((id) => id.slice(-6));
        console.log("[DEBUG] single_day done: selectedFromPoolCount=%s generatedCount=%s recipeIds=[...%s] (source not set on client, DB default)", selectedFromPoolCount, generatedCount, idSuffixes.join(", "));
        console.log("[PLAN save]", { dayKey: dateStr, dayLabel: dayName, mealsCount: generatedIds.length });
      }

      setCompletedDays((prev) => ({ ...prev, [dayIndex]: true }));
      return parsed;
    },
    [user?.id, memberId, memberData, createRecipe, createMealPlan]
  );

  /** Перегенерировать один день (с контекстом остальных дней диапазона) */
  const regenerateSingleDay = useCallback(
    async (dayIndex: number) => {
      if (!user || !session?.access_token) throw new Error("Необходима авторизация");
      if (!memberData) throw new Error("Выберите профиль (члена семьи)");
      if (dayIndex < 0 || dayIndex > 6) return;

      setIsGenerating(true);

      const rollingDates = getRolling7Dates();
      const date = rollingDates[dayIndex];
      const dateStr = formatLocalDate(date);

      try {
        let weekQuery = supabase
          .from("meal_plans_v2")
          .select("planned_date, meals")
          .eq("user_id", user.id)
          .gte("planned_date", formatLocalDate(rollingDates[0]))
          .lte("planned_date", formatLocalDate(rollingDates[6]))
          .order("planned_date");
        if (memberId != null && memberId !== "") {
          weekQuery = weekQuery.eq("member_id", memberId);
        } else {
          weekQuery = weekQuery.is("member_id", null);
        }
        const { data: weekPlans } = await weekQuery;

        const accumulated: WeekContextAccumulated = {
          chosenTitles: [],
          chosenBreakfastTitles: [],
          chosenBreakfastBases: [],
        };
        (weekPlans || []).forEach((p: { planned_date?: string; meals?: Record<string, { title?: string }> }) => {
          if (!p.planned_date || p.planned_date === dateStr) return;
          const meals = p.meals ?? {};
          (["breakfast", "lunch", "snack", "dinner"] as const).forEach((mealKey) => {
            const title = meals[mealKey]?.title?.trim();
            if (!title) return;
            accumulated.chosenTitles.push(title);
            if (mealKey === "breakfast") {
              accumulated.chosenBreakfastTitles.push(title);
              accumulated.chosenBreakfastBases.push(classifyBreakfastBase(title));
            }
          });
        });

        let deleteQuery = supabase
          .from("meal_plans_v2")
          .delete()
          .eq("user_id", user.id)
          .eq("planned_date", dateStr);
        if (memberId != null && memberId !== "") {
          deleteQuery = deleteQuery.eq("member_id", memberId);
        } else {
          deleteQuery = deleteQuery.is("member_id", null);
        }
        await deleteQuery;

        await generateSingleDay(dayIndex, date, DAY_NAMES[getWeekdayIndex(date)], session.access_token, accumulated);

        queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
        queryClient.refetchQueries({ queryKey: ["meal_plans_v2", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["recipes"] });
      } finally {
        setIsGenerating(false);
      }
    },
    [user, session, memberData, memberId, generateSingleDay, queryClient]
  );

  /** Сгенерировать один день в rolling-диапазоне (контекст из остальных 6 дней). Для autofill endKey. Не трогает isGenerating. */
  const generateSingleRollingDay = useCallback(
    async (date: Date) => {
      if (!user || !session?.access_token) throw new Error("Необходима авторизация");
      if (!memberData) throw new Error("Выберите профиль (члена семьи)");

      const rollingDates = getRolling7Dates();
      const dayKey = formatLocalDate(date);
      const dayIndex = rollingDates.findIndex((d) => formatLocalDate(d) === dayKey);
      if (dayIndex < 0) return;

      setGeneratingDayKeys((prev) => new Set(prev).add(dayKey));

      try {
        if (IS_DEV) {
          console.log("[ROLLING autofill run]", { endKey: dayKey });
          console.log("[GEN state]", { weekly: isGenerating, rollingKeys: [dayKey] });
        }

        let weekQuery = supabase
          .from("meal_plans_v2")
          .select("planned_date, meals")
          .eq("user_id", user.id)
          .gte("planned_date", formatLocalDate(rollingDates[0]))
          .lte("planned_date", formatLocalDate(rollingDates[6]))
          .order("planned_date");
        if (memberId != null && memberId !== "") {
          weekQuery = weekQuery.eq("member_id", memberId);
        } else {
          weekQuery = weekQuery.is("member_id", null);
        }
        const { data: weekPlans } = await weekQuery;

        const accumulated: WeekContextAccumulated = {
          chosenTitles: [],
          chosenBreakfastTitles: [],
          chosenBreakfastBases: [],
        };
        (weekPlans || []).forEach((p: { planned_date?: string; meals?: Record<string, { title?: string }> }) => {
          if (!p.planned_date || p.planned_date === dayKey) return;
          const meals = p.meals ?? {};
          (["breakfast", "lunch", "snack", "dinner"] as const).forEach((mealKey) => {
            const title = meals[mealKey]?.title?.trim();
            if (!title) return;
            accumulated.chosenTitles.push(title);
            if (mealKey === "breakfast") {
              accumulated.chosenBreakfastTitles.push(title);
              accumulated.chosenBreakfastBases.push(classifyBreakfastBase(title));
            }
          });
        });

        await generateSingleDay(
          dayIndex,
          date,
          DAY_NAMES[getWeekdayIndex(date)],
          session.access_token,
          accumulated
        );

        queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["recipes", user?.id] });
      } finally {
        setGeneratingDayKeys((prev) => {
          const next = new Set(prev);
          next.delete(dayKey);
          return next;
        });
      }
    },
    [user, session, memberData, memberId, generateSingleDay, queryClient, isGenerating]
  );

  const generateWeeklyPlan = useCallback(async () => {
    if (!user || !session?.access_token) throw new Error("Необходима авторизация");
    if (!memberData) throw new Error("Выберите профиль (члена семьи)");

    const rollingDates = getRolling7Dates();
    const startKey = getRollingStartKey();
    const lockKey = `${user.id}:${memberId ?? "family"}:${startKey}`;
    if (weekLockRef.current.has(lockKey)) {
      if (IS_DEV) {
        console.log("[DEBUG] skip week start: already running lockKey=%s", lockKey);
      }
      return;
    }
    weekLockRef.current.add(lockKey);
    if (IS_DEV) {
      console.log("[DEBUG] week generate start lockKey=%s", lockKey);
    }

    setIsGenerating(true);
    setCompletedDays({});
    setProgress(null);

    const endKey = getRollingEndKey();
    if (IS_DEV) {
      console.log("[PLAN generate range]", { startKey, endKey });
    }

    const token = session.access_token;
    const batchedIndices: number[][] = [[0, 1], [2, 3], [4, 5], [6]];
    let completedCount = 0;

    try {
      const accumulated: WeekContextAccumulated = {
        chosenTitles: [],
        chosenBreakfastTitles: [],
        chosenBreakfastBases: [],
      };

      for (const batch of batchedIndices) {
        const keys = batch.map((i) => formatLocalDate(rollingDates[i]));
        const labels = batch.map((i) => getShortDayLabel(rollingDates[i]));
        const currentLabel = labels.join("/");

        setGeneratingDayKeys((prev) => {
          const next = new Set(prev);
          keys.forEach((k) => next.add(k));
          return next;
        });
        setProgress({
          current: completedCount + batch.length,
          total: 7,
          currentDayLabel: currentLabel,
          generatingDayIndex: -1,
        });
        if (IS_DEV) {
          console.log("[PLAN batch]", { keys, current: completedCount + batch.length, total: 7 });
        }

        const results = await Promise.all(
          batch.map((dayIndex) => {
            const date = rollingDates[dayIndex];
            const dayName = DAY_NAMES[getWeekdayIndex(date)];
            return generateSingleDay(dayIndex, date, dayName, token, accumulated);
          })
        );

        for (const parsed of results) {
          if (parsed) {
            for (const mealKey of MEAL_KEYS) {
              const meal = parsed[mealKey];
              if (meal?.name) {
                accumulated.chosenTitles.push(meal.name.trim());
                if (mealKey === "breakfast") {
                  accumulated.chosenBreakfastTitles.push(meal.name.trim());
                  accumulated.chosenBreakfastBases.push(classifyBreakfastBase(meal.name));
                }
              }
            }
          }
        }

        completedCount += batch.length;
        setGeneratingDayKeys((prev) => {
          const next = new Set(prev);
          keys.forEach((k) => next.delete(k));
          return next;
        });
        if (IS_DEV) {
          console.log("[PLAN batch done]", { keys, current: completedCount });
        }
        queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
      }

      if (IS_DEV) {
        console.log("[DEBUG] total recipes for plan: up to 28 (all from AI, no pool); accumulated chosenTitles count:", accumulated.chosenTitles.length);
      }
      queryClient.invalidateQueries({ queryKey: ["recipes", user?.id] });
      return null;
    } finally {
      weekLockRef.current.delete(lockKey);
      setProgress(null);
      setIsGenerating(false);
    }
  }, [user, session, memberData, memberId, generateSingleDay, queryClient]);

  return {
    generateWeeklyPlan,
    regenerateSingleDay,
    generateSingleRollingDay,
    isGenerating,
    completedDays,
    progress,
    generatingDayKeys,
  };
}
