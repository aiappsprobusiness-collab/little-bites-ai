import { useCallback } from "react";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useMealPlans } from "./useMealPlans";
import { useRecipes } from "./useRecipes";
import { useQueryClient } from "@tanstack/react-query";
import { formatLocalDate } from "@/utils/dateUtils";
import { resolveUnit } from "@/utils/productUtils";
import { extractSingleJsonObject } from "@/utils/parseChatRecipes";

const MEAL_SWAP_FREE_KEY = "mealSwap_free_dayKey";

/** Fisher–Yates shuffle, returns new array. */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function useReplaceMealSlot(
  memberId: string | null,
  options?: { startKey?: string; endKey?: string; hasAccess?: boolean }
) {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const { createMealPlan } = useMealPlans(memberId ?? undefined);
  const { createRecipe } = useRecipes(memberId ?? undefined);
  const hasAccess = options?.hasAccess ?? true;

  /** Проверить, использовал ли free-пользователь замену сегодня (по dayKey). */
  const getFreeSwapUsedForDay = useCallback((dayKey: string): boolean => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(MEAL_SWAP_FREE_KEY) === dayKey;
  }, []);

  const setFreeSwapUsedForDay = useCallback((dayKey: string) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(MEAL_SWAP_FREE_KEY, dayKey);
    }
  }, []);

  /** Фильтрация кандидатов: исключаем по id (primary) и по title (вторично). */
  function filterCandidates(
    rows: { id: string; title: string }[],
    excludeRecipeIds: string[],
    excludeTitles: string[]
  ): { id: string; title: string }[] {
    const excludeSet = new Set(excludeRecipeIds);
    const excludeTitlesLower = new Set(
      excludeTitles.map((t) => t.trim().toLowerCase()).filter(Boolean)
    );
    return rows.filter(
      (r) =>
        !excludeSet.has(r.id) &&
        !excludeTitlesLower.has((r.title ?? "").trim().toLowerCase())
    );
  }

  /** Быстрая замена из пула: PASS A (строгий) → PASS B (member fallback) → PASS C (legacy meal_type). */
  const pickReplacementFromPool = useCallback(
    async (params: {
      mealType: string;
      dayKey: string;
      excludeTitles: string[];
      excludeRecipeIds: string[];
    }): Promise<{ id: string; title: string; fromLegacy?: boolean } | null> => {
      if (!user) return null;
      const memberIdFilter = memberId ?? null;
      const runQuery = async (
        mealTypeFilter: "strict" | "legacy",
        memberAllowNull: boolean
      ): Promise<{ id: string; title: string }[]> => {
        let q = supabase
          .from("recipes")
          .select("id, title")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);
        if (mealTypeFilter === "strict") {
          q = q.eq("meal_type", params.mealType);
        } else {
          q = q.is("meal_type", null);
        }
        if (memberIdFilter === null) {
          q = q.is("member_id", null);
        } else if (memberAllowNull) {
          q = q.or(`member_id.eq.${memberIdFilter},member_id.is.null`);
        } else {
          q = q.eq("member_id", memberIdFilter);
        }
        const { data: rows, error } = await q;
        if (error || !rows?.length) return [];
        return filterCandidates(
          rows as { id: string; title: string }[],
          params.excludeRecipeIds,
          params.excludeTitles
        );
      };

      let candidates = await runQuery("strict", false);
      if (candidates.length > 0) {
        const shuffled = shuffle(candidates);
        return { id: shuffled[0].id, title: shuffled[0].title };
      }
      candidates = await runQuery("strict", true);
      if (candidates.length > 0) {
        const shuffled = shuffle(candidates);
        return { id: shuffled[0].id, title: shuffled[0].title };
      }
      candidates = await runQuery("legacy", true);
      if (candidates.length > 0) {
        const shuffled = shuffle(candidates);
        return { id: shuffled[0].id, title: shuffled[0].title, fromLegacy: true };
      }
      return null;
    },
    [user, memberId]
  );

  /** Выполнить замену слота на выбранный рецепт (обновляет meal_plans_v2). */
  const replaceSlotWithRecipe = useCallback(
    async (params: {
      dayKey: string;
      mealType: string;
      recipeId: string;
      recipeTitle: string;
    }) => {
      await createMealPlan({
        member_id: memberId ?? null,
        child_id: memberId ?? null,
        planned_date: params.dayKey,
        meal_type: params.mealType,
        recipe_id: params.recipeId,
        title: params.recipeTitle,
      });
      queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
    },
    [createMealPlan, memberId, options?.startKey, options?.endKey, queryClient, user?.id]
  );

  /** Замена из пула: PASS A → B → C, обновить план. */
  const replaceWithPool = useCallback(
    async (params: {
      dayKey: string;
      mealType: string;
      excludeTitles: string[];
      excludeRecipeIds: string[];
      isFree: boolean;
    }): Promise<"ok" | "ok_legacy" | "limit" | "not_found"> => {
      if (params.isFree && getFreeSwapUsedForDay(params.dayKey)) {
        return "limit";
      }
      const picked = await pickReplacementFromPool({
        mealType: params.mealType,
        dayKey: params.dayKey,
        excludeTitles: params.excludeTitles,
        excludeRecipeIds: params.excludeRecipeIds,
      });
      if (!picked) return "not_found";
      setFreeSwapUsedForDay(params.dayKey);
      await replaceSlotWithRecipe({
        dayKey: params.dayKey,
        mealType: params.mealType,
        recipeId: picked.id,
        recipeTitle: picked.title,
      });
      return picked.fromLegacy ? "ok_legacy" : "ok";
    },
    [getFreeSwapUsedForDay, pickReplacementFromPool, replaceSlotWithRecipe, setFreeSwapUsedForDay]
  );

  /** AI-замена: один рецепт через Edge (type recipe). Запрещена для free. */
  const replaceWithAI = useCallback(
    async (params: {
      dayKey: string;
      mealType: string;
      memberData: { allergies?: string[]; preferences?: string[]; age_months?: number } | null;
      excludeTitles: string[];
    }): Promise<"ok" | "error"> => {
      if (!hasAccess) throw new Error("AI replacement is not allowed for free");
      if (!user || !session?.access_token) return "error";
      const mealLabel =
        params.mealType === "breakfast"
          ? "завтрак"
          : params.mealType === "lunch"
            ? "обед"
            : params.mealType === "snack"
              ? "полдник"
              : "ужин";
      const excludeStr =
        params.excludeTitles.length > 0
          ? ` Не повторяй: ${params.excludeTitles.slice(0, 15).join(", ")}.`
          : "";
      const res = await fetch(`${SUPABASE_URL}/functions/v1/deepseek-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: "recipe",
          stream: false,
          memberData: params.memberData ?? undefined,
          mealType: params.mealType,
          messages: [
            {
              role: "user",
              content: `Сгенерируй один рецепт для ${mealLabel}.${excludeStr} Верни только JSON.`,
            },
          ],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        recipe_id?: string | null;
        recipes?: Array<{ title?: string }>;
        message?: string;
      };
      const recipeId = data.recipe_id ?? null;
      const title =
        data.recipes?.[0]?.title ?? (typeof data.message === "string" ? data.message.slice(0, 100) : "Рецепт");
      if (recipeId) {
        await replaceSlotWithRecipe({
          dayKey: params.dayKey,
          mealType: params.mealType,
          recipeId,
          recipeTitle: title,
        });
        return "ok";
      }
      const raw = data.message ?? "";
      const jsonStr = extractSingleJsonObject(raw);
      if (!jsonStr) throw new Error("Нет рецепта в ответе");
      const parsed = JSON.parse(jsonStr) as { title?: string; ingredients?: unknown[]; steps?: unknown[] };
      const recipe = await createRecipe({
        recipe: {
          title: parsed.title ?? "Рецепт",
          description: "",
          cooking_time_minutes: null,
          member_id: memberId ?? null,
          child_id: memberId ?? null,
        },
        ingredients: (parsed.ingredients ?? []).map((ing: { name?: string; amount?: string }, idx: number) => ({
          name: (ing as { name?: string }).name ?? "Ингредиент",
          display_text: (ing as { amount?: string }).amount ?? null,
          amount: null,
          unit: resolveUnit(null, (ing as { name?: string }).name),
          category: "other" as const,
          order_index: idx,
        })),
        steps: (parsed.steps ?? []).map((step: string, idx: number) => ({
          instruction: typeof step === "string" ? step : String(step),
          step_number: idx + 1,
          duration_minutes: null,
          image_url: null,
        })),
      });
      await replaceSlotWithRecipe({
        dayKey: params.dayKey,
        mealType: params.mealType,
        recipeId: recipe.id,
        recipeTitle: recipe.title,
      });
      queryClient.invalidateQueries({ queryKey: ["recipes", user?.id] });
      return "ok";
    },
    [
      hasAccess,
      user,
      session,
      memberId,
      createRecipe,
      replaceSlotWithRecipe,
      queryClient,
    ]
  );

  return {
    replaceWithPool,
    replaceWithAI,
    getFreeSwapUsedForDay,
    replaceSlotWithRecipe,
  };
}
