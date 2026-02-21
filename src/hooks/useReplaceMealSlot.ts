import { useCallback } from "react";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useMealPlans } from "./useMealPlans";
import { useRecipes } from "./useRecipes";
import { useQueryClient } from "@tanstack/react-query";
import { formatLocalDate } from "@/utils/dateUtils";
import { resolveUnit } from "@/utils/productUtils";
import { extractSingleJsonObject } from "@/utils/parseChatRecipes";
import { normalizeMealType, isSoupLikeTitle, passesProfileFilter, getSanityBlockedReasons, type MemberDataForPool } from "@/utils/recipePool";
import { isDebugPlanEnabled } from "@/utils/debugPlan";
import { invokeGeneratePlan } from "@/api/invokeGeneratePlan";

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

  /** Быстрая замена из пула: loose member (NULL + selected), sources seed/manual/week_ai/chat_ai, нормализация meal_type, профильные фильтры, без супов на завтрак. */
  const pickReplacementFromPool = useCallback(
    async (params: {
      mealType: string;
      dayKey: string;
      excludeTitles: string[];
      excludeRecipeIds: string[];
      memberData?: MemberDataForPool | null;
    }): Promise<{ id: string; title: string; fromLegacy?: boolean } | null> => {
      if (!user) return null;
      const memberIdFilter = memberId ?? null;
      const slotNorm = normalizeMealType(params.mealType) ?? (params.mealType as "breakfast" | "lunch" | "snack" | "dinner");

      let q = supabase
        .from("recipes")
        .select("id, title, tags, description, meal_type")
        .eq("user_id", user.id)
        .in("source", ["seed", "manual", "week_ai", "chat_ai"])
        .order("created_at", { ascending: false })
        .limit(80);
      if (memberIdFilter === null) {
        q = q.is("member_id", null);
      } else {
        q = q.or(`member_id.eq.${memberIdFilter},member_id.is.null`);
      }
      const { data: rows, error } = await q;
      if (error || !rows?.length) return null;

      type Row = { id: string; title: string; tags?: string[] | null; description?: string | null; meal_type?: string | null };
      let filtered = rows as Row[];
      filtered = filtered.filter((r) => {
        const recNorm = normalizeMealType(r.meal_type);
        return recNorm === null ? slotNorm === "snack" : recNorm === slotNorm;
      });
      if (slotNorm === "breakfast") {
        filtered = filtered.filter((r) => !isSoupLikeTitle(r.title));
      }
      filtered = filtered.filter((r) => getSanityBlockedReasons(r.title, slotNorm).length === 0);
      filtered = filtered.filter((r) => passesProfileFilter(r, params.memberData).pass);
      const afterPool = filterCandidates(
        filtered.map((r) => ({ id: r.id, title: r.title })),
        params.excludeRecipeIds,
        params.excludeTitles
      );
      if (afterPool.length === 0) return null;
      const shuffled = shuffle(afterPool);
      return { id: shuffled[0].id, title: shuffled[0].title };
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

  /** Замена из пула: loose member + chat_ai, нормализация meal_type, профиль, без супов на завтрак. Не подставляем тот же recipe_id. */
  const replaceWithPool = useCallback(
    async (params: {
      dayKey: string;
      mealType: string;
      excludeTitles: string[];
      excludeRecipeIds: string[];
      isFree: boolean;
      memberData?: MemberDataForPool | null;
      currentRecipeId?: string | null;
    }): Promise<"ok" | "ok_legacy" | "limit" | "not_found"> => {
      if (params.isFree && getFreeSwapUsedForDay(params.dayKey)) {
        return "limit";
      }
      const picked = await pickReplacementFromPool({
        mealType: params.mealType,
        dayKey: params.dayKey,
        excludeTitles: params.excludeTitles,
        excludeRecipeIds: params.excludeRecipeIds,
        memberData: params.memberData,
      });
      if (!picked || (params.currentRecipeId != null && picked.id === params.currentRecipeId)) {
        return "not_found";
      }
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
      const slotConstraint =
        params.mealType === "breakfast"
          ? " Не предлагай супы, рагу, плов, тушёное — только блюда для завтрака."
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
              content: `Сгенерируй один рецепт для ${mealLabel}.${excludeStr}${slotConstraint} Верни только JSON.`,
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
        if (params.mealType === "breakfast" && (isSoupLikeTitle(title) || getSanityBlockedReasons(title, "breakfast").length > 0)) {
          throw new Error("Рецепт не подходит для завтрака (суп/рагу). Попробуйте ещё раз.");
        }
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
      if (params.mealType === "breakfast" && (isSoupLikeTitle(recipe.title) || getSanityBlockedReasons(recipe.title, "breakfast").length > 0)) {
        throw new Error("Рецепт не подходит для завтрака (суп/рагу). Попробуйте ещё раз.");
      }
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

  /** Одна кнопка замены: pool-first → AI fallback через Edge (action replace_slot). Только Premium/Trial могут вызвать AI.
   * При успехе НЕ инвалидируем кэш — вызывающая сторона делает optimistic update по данным ответа. */
  const replaceMealSlotAuto = useCallback(
    async (params: {
      dayKey: string;
      mealType: string;
      excludeRecipeIds: string[];
      excludeTitleKeys: string[];
      memberData?: MemberDataForPool | null;
      isFree: boolean;
    }): Promise<
      | { ok: true; pickedSource: "pool" | "ai"; newRecipeId: string; title: string; plan_source: "pool" | "ai"; requestId?: string; reason?: string }
      | { ok: false; error: string; code?: string; requestId?: string; reason?: string }
    > => {
      if (!hasAccess) {
        return { ok: false, error: "premium_required" };
      }
      if (params.isFree && getFreeSwapUsedForDay(params.dayKey)) {
        return { ok: false, error: "limit" };
      }
      if (!user?.id) return { ok: false, error: "unauthorized" };
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token ?? undefined;
      if (!token) return { ok: false, error: "unauthorized" };

      const replaceBody: Record<string, unknown> = {
        action: "replace_slot",
        member_id: memberId ?? null,
        day_key: params.dayKey,
        meal_type: params.mealType,
        member_data: params.memberData
          ? { allergies: params.memberData.allergies, preferences: params.memberData.preferences, age_months: params.memberData.age_months }
          : null,
        exclude_recipe_ids: params.excludeRecipeIds,
        exclude_title_keys: params.excludeTitleKeys,
      };
      if (isDebugPlanEnabled()) replaceBody.debug_plan = true;
      const res = await invokeGeneratePlan(SUPABASE_URL, token, replaceBody, {
        label: "replace_slot",
        clientDebug: { selectedMemberId: memberId ?? null, dayKey: params.dayKey, mealType: params.mealType },
      });

      const data = await res.json().catch(() => ({})) as {
        pickedSource?: "pool" | "ai";
        newRecipeId?: string;
        recipe_id?: string;
        title?: string;
        plan_source?: "pool" | "ai";
        error?: string;
        code?: string;
        reasonIfAi?: string;
        requestId?: string;
        reason?: string;
      };

      const requestId = data.requestId;
      const reason = data.reason;

      if (!res.ok) {
        return { ok: false, error: (data as { error?: string }).error ?? `Ошибка ${res.status}`, requestId, reason: "http_error" };
      }
      if (data.error === "replace_failed") {
        const failReason = data.reasonIfAi ?? data.reason ?? "ai_failed";
        const code = data.code;
        return {
          ok: false,
          error: code === "pool_exhausted" ? "Нет подходящих рецептов в пуле" : failReason === "no_recipe_in_response" ? "Не удалось подобрать рецепт" : "Не удалось заменить",
          code,
          requestId,
          reason: failReason,
        };
      }
      const recipeId = data.newRecipeId ?? data.recipe_id;
      if (data.pickedSource && recipeId && data.title != null) {
        setFreeSwapUsedForDay(params.dayKey);
        return {
          ok: true,
          pickedSource: data.pickedSource,
          newRecipeId: recipeId,
          title: data.title,
          plan_source: (data.plan_source === "pool" || data.plan_source === "ai" ? data.plan_source : data.pickedSource) ?? "pool",
          requestId,
          reason: reason ?? "ok",
        };
      }
      return { ok: false, error: "unknown_response", code: data.code, requestId, reason: "unknown_response" };
    },
    [user?.id, memberId, hasAccess, getFreeSwapUsedForDay, setFreeSwapUsedForDay]
  );

  return {
    replaceWithPool,
    replaceWithAI,
    replaceMealSlotAuto,
    getFreeSwapUsedForDay,
    replaceSlotWithRecipe,
  };
}
