import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useRecipes } from "./useRecipes";
import { useMealPlans } from "./useMealPlans";
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

interface SingleDayMeal {
  name?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  cooking_time?: number;
  ingredients?: string[];
  steps?: string[];
}

interface SingleDayResponse {
  breakfast?: SingleDayMeal;
  lunch?: SingleDayMeal;
  snack?: SingleDayMeal;
  dinner?: SingleDayMeal;
}

function getWeekDates(): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1);
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    dates.push(d);
  }
  return dates;
}

export function useGenerateWeeklyPlan(memberData: MemberData | null, memberId: string | null) {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const { createRecipe } = useRecipes();
  const { createMealPlan } = useMealPlans(memberId ?? undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const [completedDays, setCompletedDays] = useState<Record<number, boolean>>({});

  const generateSingleDay = useCallback(
    async (
      dayIndex: number,
      date: Date,
      dayName: string,
      token: string,
      weekContext?: string
    ): Promise<SingleDayResponse | null> => {
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
          weekContext,
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

      const dateStr = date.toISOString().split("T")[0];

      for (const mealKey of MEAL_KEYS) {
        const meal = parsed[mealKey];
        if (!meal?.name || !Array.isArray(meal.ingredients)) continue;

        const recipe = await createRecipe({
          recipe: {
            title: meal.name,
            description: "",
            cooking_time_minutes: meal.cooking_time ?? null,
            child_id: memberId ?? null,
          },
          ingredients: meal.ingredients.map((ing, idx) => ({
            name: typeof ing === "string" ? ing : String(ing),
            amount: null,
            unit: resolveUnit(null, typeof ing === "string" ? ing : String(ing)),
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
      }

      setCompletedDays((prev) => ({ ...prev, [dayIndex]: true }));
      return parsed;
    },
    [memberData, memberId, createRecipe, createMealPlan]
  );

  const generateWeeklyPlan = useCallback(async () => {
    if (!user || !session?.access_token) throw new Error("Необходима авторизация");
    if (!memberData) throw new Error("Выберите профиль (члена семьи)");

    setIsGenerating(true);
    setCompletedDays({});

    const weekDates = getWeekDates();
    const token = session.access_token;

    try {
      const results = await Promise.all(
        weekDates.map((date, i) =>
          generateSingleDay(i, date, DAY_NAMES[i], token)
        )
      );
      queryClient.invalidateQueries({ queryKey: ["meal_plans_v2"] });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.refetchQueries({ queryKey: ["meal_plans_v2"] });
      return results;
    } finally {
      setIsGenerating(false);
    }
  }, [user, session, memberData, generateSingleDay]);

  /** Перегенерировать один день (с контекстом остальных дней недели) */
  const regenerateSingleDay = useCallback(
    async (dayIndex: number) => {
      if (!user || !session?.access_token) throw new Error("Необходима авторизация");
      if (!memberData) throw new Error("Выберите профиль (члена семьи)");
      if (dayIndex < 0 || dayIndex > 6) return;

      setIsGenerating(true);

      const weekDates = getWeekDates();
      const date = weekDates[dayIndex];
      const dateStr = date.toISOString().split("T")[0];

      try {
        let weekQuery = supabase
          .from("meal_plans_v2")
          .select("planned_date, meals")
          .eq("user_id", user.id)
          .gte("planned_date", weekDates[0].toISOString().split("T")[0])
          .lte("planned_date", weekDates[6].toISOString().split("T")[0])
          .order("planned_date");
        if (memberId != null && memberId !== "") {
          weekQuery = weekQuery.eq("member_id", memberId);
        } else {
          weekQuery = weekQuery.is("member_id", null);
        }
        const { data: weekPlans } = await weekQuery;

        const weekContextParts: string[] = [];
        const byDate = new Map<string, string[]>();
        (weekPlans || []).forEach((p: { planned_date?: string; meals?: Record<string, { title?: string }> }) => {
          if (!p.planned_date || p.planned_date === dateStr) return;
          const meals = p.meals ?? {};
          const titles = (["breakfast", "lunch", "snack", "dinner"] as const)
            .map((k) => meals[k]?.title)
            .filter(Boolean) as string[];
          if (titles.length === 0) return;
          if (!byDate.has(p.planned_date)) byDate.set(p.planned_date, []);
          byDate.get(p.planned_date)!.push(...titles);
        });
        weekDates.forEach((d, i) => {
          if (i === dayIndex) return;
          const ds = d.toISOString().split("T")[0];
          const titles = byDate.get(ds);
          if (titles?.length) {
            weekContextParts.push(`${DAY_ABBREV[i]} — ${titles.slice(0, 2).join(", ")}`);
          }
        });
        const weekContext = weekContextParts.join(". ");

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

        await generateSingleDay(dayIndex, date, DAY_NAMES[dayIndex], session.access_token, weekContext);

        queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
        queryClient.refetchQueries({ queryKey: ["meal_plans_v2", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["recipes"] });
      } finally {
        setIsGenerating(false);
      }
    },
    [user, session, memberData, memberId, generateSingleDay, queryClient]
  );

  return {
    generateWeeklyPlan,
    regenerateSingleDay,
    isGenerating,
    completedDays,
  };
}
