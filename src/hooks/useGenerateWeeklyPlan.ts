import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useSubscription } from "./useSubscription";
import { useRecipes } from "./useRecipes";
import { useMealPlans } from "./useMealPlans";
import { formatLocalDate } from "@/utils/dateUtils";
import { getRolling7Dates, getRollingStartKey, getRollingEndKey } from "@/utils/dateRange";
import { resolveUnit } from "@/utils/productUtils";
import { extractSingleJsonObject, extractChefAdvice, extractAdvice } from "@/utils/parseChatRecipes";
import { pickRecipeFromPool, normalizeTitleKey } from "@/utils/recipePool";

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
/** Последовательная генерация дней (внутри батча): каждый день видит контекст предыдущих, меньше дублей. В DEV — вкл., в prod можно включить через VITE_SEQUENTIAL_WEEK_PLAN. */
const USE_SEQUENTIAL_WEEK_GENERATION = IS_DEV || (import.meta.env.VITE_SEQUENTIAL_WEEK_PLAN === "true" || import.meta.env.VITE_SEQUENTIAL_WEEK_PLAN === "1");

/** Накопленный контекст недели для разнообразия (передаётся в каждый следующий single_day). */
export interface WeekContextAccumulated {
  chosenTitles: string[];
  chosenBreakfastTitles: string[];
  chosenBreakfastBases: string[];
  /** Для pool-first: уже использованные recipe_id за неделю. */
  usedRecipeIds: string[];
  /** Для pool-first: normalizeTitleKey уже выбранных блюд. */
  usedTitleKeys: string[];
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
  chefAdvice?: string;
  chef_advice?: string;
  chefAdviceText?: string;
  advice?: string;
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

/** Нормализация названия рецепта для сравнения на дубли (аудит/логи). */
function normalizeRecipeTitleForDedup(title: string): string {
  return (title ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Краткая подпись дня для прогресса: Пн, Вт, ... Сб, Вс. */
function getShortDayLabel(date: Date): string {
  return DAY_ABBREV[getWeekdayIndex(date)];
}

export function useGenerateWeeklyPlan(memberData: MemberData | null, memberId: string | null) {
  const { user, session } = useAuth();
  const { hasAccess } = useSubscription();
  const queryClient = useQueryClient();
  const { createRecipe } = useRecipes();
  const { createMealPlan } = useMealPlans(memberId ?? undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  /** true = полная неделя (generateWeeklyPlan) запущена, weekLockRef содержит lockKey */
  const [isGeneratingWeek, setIsGeneratingWeek] = useState(false);
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
      weekContext?: WeekContextAccumulated | string,
      options?: { usePool: boolean }
    ): Promise<SingleDayResponse | null> => {
      const dateStrForLog = formatLocalDate(date);
      const ctxTitlesCount =
        weekContext && typeof weekContext === "object" && !Array.isArray(weekContext)
          ? (weekContext as WeekContextAccumulated).chosenTitles?.length ?? 0
          : 0;
      if (IS_DEV) {
        console.log("[DEBUG] single_day request: dayName=%s planned_date=%s member_id=%s hasWeekContext=%s weekContextTitlesCount=%s", dayName, dateStrForLog, memberId ?? "null", !!weekContext, ctxTitlesCount);
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

      if (IS_DEV) {
        const titles = MEAL_KEYS.map((k) => ({ key: k, title: (parsed as SingleDayResponse)[k]?.name ?? "", norm: normalizeRecipeTitleForDedup((parsed as SingleDayResponse)[k]?.name ?? "") }));
        console.log("[DEBUG] single_day parsed: planned_date=%s titles=%s", dateStrForLog, JSON.stringify(titles.map((t) => ({ [t.key]: t.title, norm: t.norm }))));
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
        const existingMeals = (existingRow as { meals?: Record<string, { recipe_id?: string; title?: string }> } | null)?.meals ?? {};
        const hasMeals = typeof existingMeals === "object" && Object.keys(existingMeals).length > 0;
        if (hasMeals) {
          if (IS_DEV) {
            console.log("[DEBUG] skip day apply: plan already exists planned_date=%s", dateStr);
          }
          if (options?.usePool && weekContext && typeof weekContext === "object" && !Array.isArray(weekContext)) {
            const acc = weekContext as WeekContextAccumulated;
            for (const slot of MEAL_KEYS) {
              const slotData = existingMeals[slot];
              if (slotData?.recipe_id) acc.usedRecipeIds.push(slotData.recipe_id);
              if (slotData?.title) acc.usedTitleKeys.push(normalizeTitleKey(slotData.title));
            }
          }
          setCompletedDays((prev) => ({ ...prev, [dayIndex]: true }));
          return parsed;
        }
      }

      const weakSlots = MEAL_KEYS.filter((k) => ((parsed as SingleDayResponse)[k]?.steps?.length ?? 0) < 2);
      if (weakSlots.length > 0) {
        if (IS_DEV) {
          console.log("[DEBUG] insufficient steps -> regen meal", weakSlots.join(", "));
        }
        try {
          const res2 = await fetch(`${SUPABASE_URL}/functions/v1/deepseek-chat`, {
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
          if (res2.ok) {
            const data2 = await res2.json();
            const raw2 = data2?.message ?? "";
            const jsonStr2 = extractSingleJsonObject(raw2);
            if (jsonStr2) {
              const parsed2 = JSON.parse(jsonStr2) as SingleDayResponse;
              for (const k of weakSlots) {
                if ((parsed2[k]?.steps?.length ?? 0) >= 2) {
                  const orig = parsed[k];
                  const next = parsed2[k]!;
                  (parsed as SingleDayResponse)[k] = {
                    ...next,
                    chefAdvice: extractChefAdvice(next as Record<string, unknown>) ?? extractChefAdvice(orig as Record<string, unknown>),
                    advice: extractAdvice(next as Record<string, unknown>) ?? extractAdvice(orig as Record<string, unknown>),
                  };
                }
              }
            }
          }
        } catch {
          // keep original parsed
        }
      }

      const generatedIds: string[] = [];
      let selectedFromPoolCount = 0;
      const acc = options?.usePool && weekContext && typeof weekContext === "object" && !Array.isArray(weekContext) ? (weekContext as WeekContextAccumulated) : null;
      const usePool = options?.usePool && hasAccess && user?.id && acc;

      for (const mealKey of MEAL_KEYS) {
        const meal = parsed[mealKey];
        if (!meal?.name || !Array.isArray(meal.ingredients)) continue;

        let recipeId: string;
        let recipeTitle: string;

        if (usePool) {
          const poolRecipe = await pickRecipeFromPool({
            supabase,
            userId: user.id,
            memberId: memberId ?? null,
            mealType: mealKey,
            memberData: memberData ? { allergies: memberData.allergies, preferences: memberData.preferences as string | string[] | undefined, age_months: memberData.age_months ?? memberData.ageMonths } : undefined,
            excludeRecipeIds: acc.usedRecipeIds,
            excludeTitleKeys: acc.usedTitleKeys,
            limitCandidates: 60,
          });

          if (poolRecipe) {
            recipeId = poolRecipe.id;
            recipeTitle = poolRecipe.title;
            selectedFromPoolCount++;
            acc.usedRecipeIds.push(poolRecipe.id);
            acc.usedTitleKeys.push(normalizeTitleKey(poolRecipe.title));
            acc.chosenTitles.push(poolRecipe.title);
            if (mealKey === "breakfast") {
              acc.chosenBreakfastTitles.push(poolRecipe.title);
              acc.chosenBreakfastBases.push(classifyBreakfastBase(poolRecipe.title));
            }
            if (IS_DEV) {
              console.log("[DEBUG] pool hit meal=%s title=%s id=%s", mealKey, poolRecipe.title, poolRecipe.id.slice(-6));
            }
          } else {
            if (IS_DEV) {
              console.log("[POOL DEBUG] ai fallback", {
                mealType: mealKey,
                memberId: memberId ?? null,
                pickedSource: "ai",
                rejectReason: "no_candidates_or_filtered",
              });
            }
            const stepCount = meal.steps?.length ?? 0;
            if (stepCount < 2 && IS_DEV) {
              console.log("[DEBUG] insufficient steps accepted without padding", { mealKey, title: meal.name, stepCount });
            }
            const normalizedIngredients = meal.ingredients.map((ing) => normalizeSingleDayIngredient(ing));
            const chefAdvice = extractChefAdvice(meal as Record<string, unknown>);
            const adviceVal = extractAdvice(meal as Record<string, unknown>);
            if (IS_DEV && (chefAdvice || adviceVal)) {
              console.log("[DEBUG] weekly/day save hasChefAdvice=%s hasAdvice=%s title=%s", !!chefAdvice, !!adviceVal, meal.name);
            }
            const recipe = await createRecipe({
              source: "week_ai",
              recipe: {
                title: meal.name,
                description: "",
                cooking_time_minutes: meal.cooking_time ?? null,
                member_id: memberId ?? null,
                child_id: memberId ?? null,
                ...(chefAdvice && { chef_advice: chefAdvice }),
                ...(adviceVal && { advice: adviceVal }),
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
            recipeId = recipe.id;
            recipeTitle = recipe.title;
            generatedIds.push(recipe.id);
            acc.usedRecipeIds.push(recipe.id);
            acc.usedTitleKeys.push(normalizeTitleKey(recipe.title));
            acc.chosenTitles.push(recipe.title);
            if (mealKey === "breakfast") {
              acc.chosenBreakfastTitles.push(recipe.title);
              acc.chosenBreakfastBases.push(classifyBreakfastBase(recipe.title));
            }
          }
        } else {
          const stepCount = meal.steps?.length ?? 0;
          if (stepCount < 2 && IS_DEV) {
            console.log("[DEBUG] insufficient steps accepted without padding", { mealKey, title: meal.name, stepCount });
          }
          const normalizedIngredients = meal.ingredients.map((ing) => normalizeSingleDayIngredient(ing));
          const chefAdvice = extractChefAdvice(meal as Record<string, unknown>);
          const adviceVal = extractAdvice(meal as Record<string, unknown>);
          if (IS_DEV && (chefAdvice || adviceVal)) {
            console.log("[DEBUG] weekly/day save hasChefAdvice=%s hasAdvice=%s title=%s", !!chefAdvice, !!adviceVal, meal.name);
          }
          const recipe = await createRecipe({
            source: "week_ai",
            recipe: {
              title: meal.name,
              description: "",
              cooking_time_minutes: meal.cooking_time ?? null,
              member_id: memberId ?? null,
              child_id: memberId ?? null,
              ...(chefAdvice && { chef_advice: chefAdvice }),
              ...(adviceVal && { advice: adviceVal }),
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
          recipeId = recipe.id;
          recipeTitle = recipe.title;
          generatedIds.push(recipe.id);
        }

        await createMealPlan({
          child_id: memberId ?? null,
          member_id: memberId ?? null,
          recipe_id: recipeId,
          planned_date: dateStr,
          meal_type: mealKey,
          is_completed: false,
          title: recipeTitle,
        });
      }

      if (IS_DEV) {
        const generatedCount = generatedIds.length;
        const idSuffixes = generatedIds.map((id) => id.slice(-6));
        console.log("[DEBUG] single_day done: selectedFromPoolCount=%s generatedCount=%s recipeIds=[...%s]", selectedFromPoolCount, generatedCount, idSuffixes.join(", "));
        console.log("[PLAN save]", { dayKey: dateStr, dayLabel: dayName, mealsCount: selectedFromPoolCount + generatedIds.length });
      }

      setCompletedDays((prev) => ({ ...prev, [dayIndex]: true }));
      return parsed;
    },
    [user?.id, memberId, memberData, createRecipe, createMealPlan, hasAccess]
  );

  /** Перегенерировать один день (с контекстом остальных дней диапазона) */
  const regenerateSingleDay = useCallback(
    async (dayIndex: number) => {
      if (!user || !session?.access_token) throw new Error("Необходима авторизация");
      if (!memberData) throw new Error("Выберите профиль (члена семьи)");
      if (dayIndex < 0 || dayIndex > 6) return;

      setIsGenerating(true);
      if (IS_DEV) console.log("[DEBUG] generation guard active (day)");

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
          usedRecipeIds: [],
          usedTitleKeys: [],
        };
        (weekPlans || []).forEach((p: { planned_date?: string; meals?: Record<string, { title?: string; recipe_id?: string }> }) => {
          if (!p.planned_date || p.planned_date === dateStr) return;
          const meals = p.meals ?? {};
          (["breakfast", "lunch", "snack", "dinner"] as const).forEach((mealKey) => {
            const slot = meals[mealKey];
            const title = slot?.title?.trim();
            if (slot?.recipe_id) accumulated.usedRecipeIds.push(slot.recipe_id);
            if (title) {
              accumulated.chosenTitles.push(title);
              accumulated.usedTitleKeys.push(normalizeTitleKey(title));
              if (mealKey === "breakfast") {
                accumulated.chosenBreakfastTitles.push(title);
                accumulated.chosenBreakfastBases.push(classifyBreakfastBase(title));
              }
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

        await generateSingleDay(dayIndex, date, DAY_NAMES[getWeekdayIndex(date)], session.access_token, accumulated, { usePool: false });

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
          usedRecipeIds: [],
          usedTitleKeys: [],
        };
        (weekPlans || []).forEach((p: { planned_date?: string; meals?: Record<string, { title?: string; recipe_id?: string }> }) => {
          if (!p.planned_date || p.planned_date === dayKey) return;
          const meals = p.meals ?? {};
          (["breakfast", "lunch", "snack", "dinner"] as const).forEach((mealKey) => {
            const slot = meals[mealKey];
            const title = slot?.title?.trim();
            if (slot?.recipe_id) accumulated.usedRecipeIds.push(slot.recipe_id);
            if (title) {
              accumulated.chosenTitles.push(title);
              accumulated.usedTitleKeys.push(normalizeTitleKey(title));
              if (mealKey === "breakfast") {
                accumulated.chosenBreakfastTitles.push(title);
                accumulated.chosenBreakfastBases.push(classifyBreakfastBase(title));
              }
            }
          });
        });

        await generateSingleDay(
          dayIndex,
          date,
          DAY_NAMES[getWeekdayIndex(date)],
          session.access_token,
          accumulated,
          { usePool: false }
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
    setIsGeneratingWeek(true);
    if (IS_DEV) {
      console.log("[DEBUG] week generate start lockKey=%s", lockKey);
      console.log("[DEBUG] generation guard active (week)");
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
      const { data: initialWeekPlans } = await weekQuery;

      const accumulated: WeekContextAccumulated = {
        chosenTitles: [],
        chosenBreakfastTitles: [],
        chosenBreakfastBases: [],
        usedRecipeIds: [],
        usedTitleKeys: [],
      };
      (initialWeekPlans || []).forEach((p: { planned_date?: string; meals?: Record<string, { title?: string; recipe_id?: string }> }) => {
        const meals = p.meals ?? {};
        (["breakfast", "lunch", "snack", "dinner"] as const).forEach((mealKey) => {
          const slot = meals[mealKey];
          const title = slot?.title?.trim();
          if (slot?.recipe_id) accumulated.usedRecipeIds.push(slot.recipe_id);
          if (title) {
            accumulated.chosenTitles.push(title);
            accumulated.usedTitleKeys.push(normalizeTitleKey(title));
            if (mealKey === "breakfast") {
              accumulated.chosenBreakfastTitles.push(title);
              accumulated.chosenBreakfastBases.push(classifyBreakfastBase(title));
            }
          }
        });
      });

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
          console.log("[PLAN batch]", { keys, current: completedCount + batch.length, total: 7, sequential: USE_SEQUENTIAL_WEEK_GENERATION });
        }

        const mergeParsedIntoAccumulated = (parsed: SingleDayResponse | null) => {
          if (!parsed) return;
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
        };

        if (USE_SEQUENTIAL_WEEK_GENERATION) {
          for (const dayIndex of batch) {
            const date = rollingDates[dayIndex];
            const dayName = DAY_NAMES[getWeekdayIndex(date)];
            const result = await generateSingleDay(dayIndex, date, dayName, token, accumulated, { usePool: true });
            mergeParsedIntoAccumulated(result);
          }
        } else {
          const results = await Promise.all(
            batch.map((dayIndex) => {
              const date = rollingDates[dayIndex];
              const dayName = DAY_NAMES[getWeekdayIndex(date)];
              return generateSingleDay(dayIndex, date, dayName, token, accumulated, { usePool: true });
            })
          );
          for (const parsed of results) mergeParsedIntoAccumulated(parsed);
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
        const allNorm = accumulated.chosenTitles.map((t) => normalizeRecipeTitleForDedup(t));
        const countByNorm = new Map<string, number>();
        allNorm.forEach((n) => countByNorm.set(n, (countByNorm.get(n) ?? 0) + 1));
        const duplicates = [...countByNorm.entries()].filter(([, c]) => c > 1).map(([k]) => k);
        console.log("[DEBUG] week apply done: chosenTitles count=%s all normalized (sample)=%s duplicates count=%s list=%s", accumulated.chosenTitles.length, allNorm.slice(0, 12).join(" | "), duplicates.length, duplicates.length ? duplicates.join(", ") : "(none)");
      }
      queryClient.invalidateQueries({ queryKey: ["recipes", user?.id] });
      return null;
    } finally {
      weekLockRef.current.delete(lockKey);
      setIsGeneratingWeek(false);
      setProgress(null);
      setIsGenerating(false);
    }
  }, [user, session, memberData, memberId, generateSingleDay, queryClient]);

  /** true когда идёт хотя бы один single_day (autofill или regenerate) */
  const isGeneratingAnyDay = isGenerating || generatingDayKeys.size > 0;
  const weekProgress = isGeneratingWeek
    ? { done: Object.values(completedDays).filter(Boolean).length, total: 7 }
    : { done: 0, total: 7 };

  return {
    generateWeeklyPlan,
    regenerateSingleDay,
    generateSingleRollingDay,
    isGenerating,
    isGeneratingWeek,
    isGeneratingAnyDay,
    weekProgress,
    completedDays,
    progress,
    generatingDayKeys,
  };
}
