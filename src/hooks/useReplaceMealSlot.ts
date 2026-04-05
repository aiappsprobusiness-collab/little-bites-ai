import { useCallback } from "react";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useMealPlans } from "./useMealPlans";
import { useRecipes } from "./useRecipes";
import { useQueryClient } from "@tanstack/react-query";
import { formatLocalDate } from "@/utils/dateUtils";
import { resolveUnit } from "@/utils/productUtils";
import { extractSingleJsonObject } from "@/utils/parseChatRecipes";
import {
  normalizeMealType,
  isSoupLikeTitle,
  passesProfileFilter,
  getSanityBlockedReasons,
  recipeFitsAgeMonthsRow,
  applyUnder12PoolAgeMonthsSqlFilter,
  filterPoolCandidatesForSlot,
  memberHasDislikesForPool,
  computeSlotFitForPoolRow,
  normalizeTitleKey,
  POOL_TRUST_OR,
  recipeTitleDedupeKey,
  buildSevenDayPlanKeysEndingAt,
  collectRecipeSlotsFromPlansExcludingSlotClient,
  mergeKeyIngredientCountsFromPlanSlots,
  type MemberDataForPool,
  type PoolRecipeRow,
} from "@/utils/recipePool";
import { buildAlignedRankSalt } from "@shared/planRankTrustShared";
import { pickFromPoolRankingLite, type PoolRankLiteRow } from "@/utils/poolRankLite";
import { POOL_SOURCES } from "@/utils/recipeCanonical";
import { isDebugPlanEnabled } from "@/utils/debugPlan";
import { invokeGeneratePlan } from "@/api/invokeGeneratePlan";
import { trackUsageEvent } from "@/utils/usageEvents";

const MEAL_SWAP_FREE_KEY = "mealSwap_free";
const FREE_SWAP_LIMIT_PER_DAY = 2;

function getStoredFreeSwap(dayKey: string): { dayKey: string; count: number } {
  if (typeof localStorage === "undefined") return { dayKey: "", count: 0 };
  try {
    const raw = localStorage.getItem(MEAL_SWAP_FREE_KEY);
    if (!raw) return { dayKey: "", count: 0 };
    const parsed = JSON.parse(raw) as { dayKey?: string; count?: number };
    return { dayKey: parsed.dayKey ?? "", count: typeof parsed.count === "number" ? parsed.count : 0 };
  } catch {
    return { dayKey: "", count: 0 };
  }
}

function setStoredFreeSwap(dayKey: string, count: number) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(MEAL_SWAP_FREE_KEY, JSON.stringify({ dayKey, count }));
  }
}

export function useReplaceMealSlot(
  memberId: string | null,
  options?: {
    startKey?: string;
    endKey?: string;
    hasAccess?: boolean;
    /** false — не грузим списки recipes до replace (Этап 1); мутация createRecipe доступна всегда. */
    recipeListQueriesEnabled?: boolean;
  }
) {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const { createMealPlan } = useMealPlans(memberId ?? undefined);
  const { createRecipe } = useRecipes(memberId ?? undefined, {
    listQueriesEnabled: options?.recipeListQueriesEnabled ?? true,
  });
  const hasAccess = options?.hasAccess ?? true;

  /** Free: true если по dayKey уже использовано >= FREE_SWAP_LIMIT_PER_DAY замен. */
  const getFreeSwapUsedForDay = useCallback((dayKey: string): boolean => {
    const stored = getStoredFreeSwap(dayKey);
    return stored.dayKey === dayKey && stored.count >= FREE_SWAP_LIMIT_PER_DAY;
  }, []);

  const setFreeSwapUsedForDay = useCallback((dayKey: string) => {
    const stored = getStoredFreeSwap(dayKey);
    const nextCount = stored.dayKey === dayKey ? Math.min(stored.count + 1, FREE_SWAP_LIMIT_PER_DAY) : 1;
    setStoredFreeSwap(dayKey, nextCount);
  }, []);

  /** Фильтрация кандидатов: исключаем по id (primary) и по ключу заголовка (как Edge / recipePool). */
  function filterCandidates(
    rows: { id: string; title: string; norm_title?: string | null }[],
    excludeRecipeIds: string[],
    excludeTitles: string[]
  ): { id: string; title: string; norm_title?: string | null }[] {
    const excludeSet = new Set(excludeRecipeIds);
    const excludeTitleKeys = new Set(excludeTitles.map((t) => normalizeTitleKey(t)).filter(Boolean));
    return rows.filter(
      (r) => !excludeSet.has(r.id) && !excludeTitleKeys.has(recipeTitleDedupeKey(r)),
    );
  }

  /** Быстрая замена из пула: те же фильтры, что `pickRecipeFromPool` / `filterPoolCandidatesForSlot`. Для прикорма (&lt;12) при слотах-носителях breakfast/lunch — общий infant-пул, без breakfast/lunch-only по `recipes.meal_type`. */
  const pickReplacementFromPool = useCallback(
    async (params: {
      mealType: string;
      dayKey: string;
      excludeTitles: string[];
      excludeRecipeIds: string[];
      memberData?: MemberDataForPool | null;
    }): Promise<{ id: string; title: string; fromLegacy?: boolean } | null> => {
      if (!user) return null;
      const replaceSessionEntropy =
        typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `repl_${Date.now()}`;
      const slotNorm = normalizeMealType(params.mealType) ?? (params.mealType as "breakfast" | "lunch" | "snack" | "dinner");
      const ageMonths = params.memberData?.age_months;
      const infantCarrierRepl =
        ageMonths != null &&
        ageMonths < 12 &&
        (slotNorm === "breakfast" || slotNorm === "lunch");

      const hasAllergies = Array.isArray(params.memberData?.allergies) && params.memberData.allergies.length > 0;
      const hasDislikes = memberHasDislikesForPool(params.memberData ?? null);
      const hasIntroduced =
        Array.isArray(params.memberData?.introduced_product_keys) &&
        (params.memberData?.introduced_product_keys?.length ?? 0) > 0;
      const hasIntroducing =
        !!params.memberData?.introducing_product_key && !!params.memberData?.introducing_started_at;

      const needsIngredientDiversity =
        !infantCarrierRepl && (ageMonths == null || ageMonths >= 12);

      const selectFields =
        infantCarrierRepl ||
        hasAllergies ||
        hasDislikes ||
        hasIntroduced ||
        hasIntroducing ||
        needsIngredientDiversity
          ? "id, title, norm_title, tags, description, meal_type, min_age_months, max_age_months, trust_level, score, cooking_time_minutes, recipe_ingredients(name, display_text)"
          : "id, title, norm_title, tags, description, meal_type, min_age_months, max_age_months, trust_level, score, cooking_time_minutes";

      const ageMonthsForPool =
        params.memberData?.age_months ??
        (params.memberData?.age_years != null && Number.isFinite(params.memberData.age_years)
          ? params.memberData.age_years * 12
          : null);

      let q = supabase
        .from("recipes")
        .select(selectFields)
        .in("source", [...POOL_SOURCES])
        .or(POOL_TRUST_OR);
      q = applyUnder12PoolAgeMonthsSqlFilter(q, ageMonthsForPool);
      const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(80);
      if (error || !rows?.length) return null;

      type Row = {
        id: string;
        title: string;
        norm_title?: string | null;
        tags?: string[] | null;
        description?: string | null;
        meal_type?: string | null;
        min_age_months?: number | null;
        max_age_months?: number | null;
        trust_level?: string | null;
        score?: number | null;
        cooking_time_minutes?: number | null;
        recipe_ingredients?: Array<{ name?: string; display_text?: string }> | null;
      };
      let filtered = rows as Row[];

      let replaceUsedKeyIngredientCounts: Record<string, number> | undefined;
      let replaceUsedKeyIngredientCountsByMeal: Record<string, Record<string, number>> | undefined;
      if (needsIngredientDiversity && user?.id) {
        const windowKeys = buildSevenDayPlanKeysEndingAt(params.dayKey);
        const slotsForIng = await collectRecipeSlotsFromPlansExcludingSlotClient(
          supabase,
          user.id,
          memberId ?? null,
          windowKeys,
          params.dayKey,
          params.mealType,
        );
        const g: Record<string, number> = {};
        const m: Record<string, Record<string, number>> = {};
        await mergeKeyIngredientCountsFromPlanSlots(supabase, slotsForIng, g, m);
        replaceUsedKeyIngredientCounts = g;
        replaceUsedKeyIngredientCountsByMeal = m;
      }

      const pickRanked = (
        cands: PoolRecipeRow[],
        rankSalt: string,
        ingCounts?: Record<string, number>,
        ingByMeal?: Record<string, Record<string, number>>,
      ) => {
        const ranked = pickFromPoolRankingLite(cands as PoolRankLiteRow[], {
          rankSalt,
          getSlotFit: (row) =>
            computeSlotFitForPoolRow(row as PoolRecipeRow, {
              slotNorm,
              memberData: params.memberData ?? null,
              infantSlotRole: null,
              usedKeyIngredientCounts: ingCounts ?? null,
              usedKeyIngredientCountsByMealType: ingByMeal ?? null,
            }),
        });
        if (import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debugPool") === "1") {
          console.log("[POOL DEBUG replace-slot]", { rankSalt, pool_rank_lite: ranked?.debug });
        }
        return ranked ? { id: ranked.row.id, title: ranked.row.title } : null;
      };

      if (infantCarrierRepl) {
        const poolFiltered = filterPoolCandidatesForSlot(filtered as PoolRecipeRow[], {
          slotNorm,
          memberData: params.memberData ?? null,
          excludeRecipeIds: params.excludeRecipeIds,
          excludeTitleKeys: params.excludeTitles,
          infantSlotRole: null,
        });
        if (poolFiltered.length === 0) return null;
        const salt = buildAlignedRankSalt({
          kind: "replace",
          userId: user.id,
          mealType: params.mealType,
          dayKey: params.dayKey,
          variant: "infant",
          rankEntropy: replaceSessionEntropy,
        });
        return pickRanked(poolFiltered, salt, undefined, undefined);
      }

      filtered = filtered.filter((r) => {
        const recNorm = normalizeMealType(r.meal_type);
        return recNorm === null ? slotNorm === "snack" : recNorm === slotNorm;
      });
      if (ageMonths != null && ageMonths < 12) {
        filtered = filtered.filter((r) =>
          recipeFitsAgeMonthsRow(r.min_age_months ?? null, r.max_age_months ?? null, ageMonths)
        );
      }
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
      const idSet = new Set(afterPool.map((x) => x.id));
      const fullRows = filtered.filter((r) => idSet.has(r.id)) as PoolRecipeRow[];
      const salt = buildAlignedRankSalt({
        kind: "replace",
        userId: user.id,
        mealType: params.mealType,
        dayKey: params.dayKey,
        rankEntropy: replaceSessionEntropy,
      });
      return pickRanked(fullRows, salt, replaceUsedKeyIngredientCounts, replaceUsedKeyIngredientCountsByMeal);
    },
    [user, memberId]
  );

  /** Выполнить замену слота на выбранный рецепт (обновляет meal_plans_v2). */
  const replaceSlotWithRecipe = useCallback(
    async (
      params: {
        dayKey: string;
        mealType: string;
        recipeId: string;
        recipeTitle: string;
        /** Источник для usage_events plan_slot_replace_success */
        replaceAnalyticsSource?: "pool_pick" | "ai_chat" | "assign";
      },
      opts?: { skipAttempt?: boolean }
    ) => {
      const baseProps = {
        day_key: params.dayKey,
        meal_type: params.mealType,
        source: params.replaceAnalyticsSource ?? "assign",
      };
      if (!opts?.skipAttempt) {
        trackUsageEvent("plan_slot_replace_attempt", {
          memberId: memberId ?? null,
          properties: baseProps,
        });
      }
      try {
        await createMealPlan({
          member_id: memberId ?? null,
          child_id: memberId ?? null,
          planned_date: params.dayKey,
          meal_type: params.mealType,
          recipe_id: params.recipeId,
          title: params.recipeTitle,
        });
      } catch {
        trackUsageEvent("plan_slot_replace_fail", {
          memberId: memberId ?? null,
          properties: {
            ...baseProps,
            reason: "persist_error",
            error_type: "meal_plan_write",
          },
        });
        throw new Error("meal_plan_write_failed");
      }
      trackUsageEvent("plan_slot_replace_success", {
        memberId: memberId ?? null,
        properties: baseProps,
      });
      /** Синхронизация кэша: только `createMealPlan.onSuccess` → узкая invalidate по `planned_date` (без второго широкого каскада). */
    },
    [createMealPlan, memberId, user?.id]
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
      const poolBase = {
        day_key: params.dayKey,
        meal_type: params.mealType,
        source: "pool_pick" as const,
      };
      if (params.isFree && getFreeSwapUsedForDay(params.dayKey)) {
        trackUsageEvent("plan_slot_replace_fail", {
          memberId: memberId ?? null,
          properties: { ...poolBase, reason: "free_limit" },
        });
        return "limit";
      }
      trackUsageEvent("plan_slot_replace_attempt", {
        memberId: memberId ?? null,
        properties: poolBase,
      });
      const picked = await pickReplacementFromPool({
        mealType: params.mealType,
        dayKey: params.dayKey,
        excludeTitles: params.excludeTitles,
        excludeRecipeIds: params.excludeRecipeIds,
        memberData: params.memberData,
      });
      if (!picked || (params.currentRecipeId != null && picked.id === params.currentRecipeId)) {
        trackUsageEvent("plan_slot_replace_fail", {
          memberId: memberId ?? null,
          properties: { ...poolBase, reason: "pool_empty" },
        });
        return "not_found";
      }
      setFreeSwapUsedForDay(params.dayKey);
      await replaceSlotWithRecipe(
        {
          dayKey: params.dayKey,
          mealType: params.mealType,
          recipeId: picked.id,
          recipeTitle: picked.title,
          replaceAnalyticsSource: "pool_pick",
        },
        { skipAttempt: true }
      );
      return picked.fromLegacy ? "ok_legacy" : "ok";
    },
    [getFreeSwapUsedForDay, pickReplacementFromPool, replaceSlotWithRecipe, setFreeSwapUsedForDay, memberId]
  );

  /** AI-замена: один рецепт через Edge (type recipe). Запрещена для free. */
  const replaceWithAI = useCallback(
    async (params: {
      dayKey: string;
      mealType: string;
      memberData: { allergies?: string[]; likes?: string[]; dislikes?: string[]; age_months?: number } | null;
      excludeTitles: string[];
    }): Promise<"ok" | "error"> => {
      if (!hasAccess) throw new Error("AI replacement is not allowed for free");
      if (!user || !session?.access_token) return "error";
      const aiBase = {
        day_key: params.dayKey,
        meal_type: params.mealType,
        source: "ai_chat" as const,
      };
      trackUsageEvent("plan_slot_replace_attempt", {
        memberId: memberId ?? null,
        properties: aiBase,
      });
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
        trackUsageEvent("plan_slot_replace_fail", {
          memberId: memberId ?? null,
          properties: { ...aiBase, reason: "chat_http_error" },
        });
        throw new Error(err?.message || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        recipe_id?: string | null;
        recipes?: Array<{ title?: string }>;
        message?: string;
        route?: string;
      };
      if (data.route === "under_12_curated_recipe_block") {
        trackUsageEvent("plan_slot_replace_fail", {
          memberId: memberId ?? null,
          properties: { ...aiBase, reason: "policy_curated_block" },
        });
        throw new Error(
          typeof data.message === "string" && data.message.trim()
            ? data.message
            : "Для малышей до года рецепты в чате не генерируются — выберите блюда в плане питания.",
        );
      }
      const recipeId = data.recipe_id ?? null;
      const title =
        data.recipes?.[0]?.title ?? (typeof data.message === "string" ? data.message.slice(0, 100) : "Рецепт");
      if (recipeId) {
        if (params.mealType === "breakfast" && (isSoupLikeTitle(title) || getSanityBlockedReasons(title, "breakfast").length > 0)) {
          trackUsageEvent("plan_slot_replace_fail", {
            memberId: memberId ?? null,
            properties: { ...aiBase, reason: "validation_breakfast" },
          });
          throw new Error("Рецепт не подходит для завтрака (суп/рагу). Попробуйте ещё раз.");
        }
        await replaceSlotWithRecipe(
          {
            dayKey: params.dayKey,
            mealType: params.mealType,
            recipeId,
            recipeTitle: title,
            replaceAnalyticsSource: "ai_chat",
          },
          { skipAttempt: true }
        );
        return "ok";
      }
      const raw = data.message ?? "";
      const jsonStr = extractSingleJsonObject(raw);
      if (!jsonStr) {
        trackUsageEvent("plan_slot_replace_fail", {
          memberId: memberId ?? null,
          properties: { ...aiBase, reason: "no_recipe_json" },
        });
        throw new Error("Нет рецепта в ответе");
      }
      let parsed: { title?: string; ingredients?: unknown[]; steps?: unknown[] };
      try {
        parsed = JSON.parse(jsonStr) as { title?: string; ingredients?: unknown[]; steps?: unknown[] };
      } catch {
        trackUsageEvent("plan_slot_replace_fail", {
          memberId: memberId ?? null,
          properties: { ...aiBase, reason: "parse_error" },
        });
        throw new Error("Нет рецепта в ответе");
      }
      let recipe: Awaited<ReturnType<typeof createRecipe>>;
      try {
        recipe = await createRecipe({
        source: "chat_ai",
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
      } catch {
        trackUsageEvent("plan_slot_replace_fail", {
          memberId: memberId ?? null,
          properties: { ...aiBase, reason: "recipe_create_error" },
        });
        throw new Error("Не удалось сохранить рецепт");
      }
      if (params.mealType === "breakfast" && (isSoupLikeTitle(recipe.title) || getSanityBlockedReasons(recipe.title, "breakfast").length > 0)) {
        trackUsageEvent("plan_slot_replace_fail", {
          memberId: memberId ?? null,
          properties: { ...aiBase, reason: "validation_breakfast" },
        });
        throw new Error("Рецепт не подходит для завтрака (суп/рагу). Попробуйте ещё раз.");
      }
      await replaceSlotWithRecipe(
        {
          dayKey: params.dayKey,
          mealType: params.mealType,
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          replaceAnalyticsSource: "ai_chat",
        },
        { skipAttempt: true }
      );
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

      const autoBase = {
        day_key: params.dayKey,
        meal_type: params.mealType,
        source: "auto" as const,
      };
      trackUsageEvent("plan_slot_replace_attempt", {
        memberId: memberId ?? null,
        properties: autoBase,
      });

      const doRequest = async (attempt: number) => {
        const replaceBody: Record<string, unknown> = {
          action: "replace_slot",
          member_id: memberId ?? null,
          day_key: params.dayKey,
          meal_type: params.mealType,
          member_data: params.memberData
            ? { allergies: params.memberData.allergies, likes: params.memberData.likes, dislikes: params.memberData.dislikes, age_months: params.memberData.age_months }
            : null,
          exclude_recipe_ids: params.excludeRecipeIds,
          exclude_title_keys: params.excludeTitleKeys,
          attempt,
        };
        if (isDebugPlanEnabled()) replaceBody.debug_plan = true;
        const res = await invokeGeneratePlan(SUPABASE_URL, token, replaceBody, {
          label: "replace_slot",
          clientDebug: { selectedMemberId: memberId ?? null, dayKey: params.dayKey, mealType: params.mealType, attempt },
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
          retry_suggested?: boolean;
        };
        return { res, data };
      };

      let res: Awaited<ReturnType<typeof invokeGeneratePlan>>;
      let data: Awaited<ReturnType<typeof doRequest>>["data"];
      ({ res, data } = await doRequest(1));

      const retrySuggested = data.code === "pool_exhausted_retry" || data.retry_suggested === true;
      if (data.error === "replace_failed" && retrySuggested) {
        ({ res, data } = await doRequest(2));
      }

      const requestId = data.requestId;
      const reason = data.reason;
      let didCountFreeSwap = false;

      if (!res.ok) {
        if (res.status === 429 && (data as { code?: string }).code === "LIMIT_REACHED") {
          trackUsageEvent("plan_slot_replace_fail", {
            memberId: memberId ?? null,
            properties: { ...autoBase, reason: "limit_reached" },
          });
          return { ok: false, error: "LIMIT_REACHED", code: "LIMIT_REACHED", requestId, reason: "limit_reached" };
        }
        trackUsageEvent("plan_slot_replace_fail", {
          memberId: memberId ?? null,
          properties: { ...autoBase, reason: "http_error" },
        });
        return { ok: false, error: (data as { error?: string }).error ?? `Ошибка ${res.status}`, requestId, reason: "http_error" };
      }
      if (data.error === "replace_failed") {
        const failReason = data.reasonIfAi ?? data.reason ?? "ai_failed";
        const code = data.code;
        trackUsageEvent("plan_slot_replace_fail", {
          memberId: memberId ?? null,
          properties: {
            ...autoBase,
            reason: String(failReason).slice(0, 120),
            fail_code: code ?? "replace_failed",
          },
        });
        return {
          ok: false,
          error: code === "pool_exhausted" || code === "pool_exhausted_retry" ? "Нет подходящих рецептов в пуле" : failReason === "no_recipe_in_response" ? "Не удалось подобрать рецепт" : "Не удалось заменить",
          code: code === "pool_exhausted_retry" ? "pool_exhausted" : code,
          requestId,
          reason: failReason,
        };
      }
      const recipeId = data.newRecipeId ?? data.recipe_id;
      if (data.pickedSource && recipeId && data.title != null) {
        if (!didCountFreeSwap) {
          didCountFreeSwap = true;
          setFreeSwapUsedForDay(params.dayKey);
        }
        const planSource =
          (data.plan_source === "pool" || data.plan_source === "ai" ? data.plan_source : data.pickedSource) ?? "pool";
        trackUsageEvent("plan_slot_replace_success", {
          memberId: memberId ?? null,
          properties: {
            day_key: params.dayKey,
            meal_type: params.mealType,
            source: data.pickedSource === "pool" ? "auto_pool" : "auto_ai",
            plan_source: planSource,
          },
        });
        return {
          ok: true,
          pickedSource: data.pickedSource,
          newRecipeId: recipeId,
          title: data.title,
          plan_source: planSource,
          requestId,
          reason: reason ?? "ok",
        };
      }
      trackUsageEvent("plan_slot_replace_fail", {
        memberId: memberId ?? null,
        properties: { ...autoBase, reason: "unknown_response" },
      });
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
