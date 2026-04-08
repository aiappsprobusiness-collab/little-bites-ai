import type { Dispatch, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isInfantAutoreplaceContext,
  getAutoReplaceLimitPerSlotPerDay,
  getSlotDayKey,
  type InfantPoolExhaustedReason,
} from "@/utils/infantAutoreplace";
import { isInfantNewRecipePlanSlot } from "@/utils/infantComplementaryPlan";
import { normalizeTitleKey } from "@/utils/recipePool";
import { applyReplaceSlotToPlanCache } from "@/utils/planCache";
import { getLimitReachedTitle, getLimitReachedMessage } from "@/utils/limitReachedMessages";
import type { MembersRow } from "@/integrations/supabase/types-v2";
import {
  pickInfantNewRecipe,
  pickInfantFamiliarRecipe,
  type MemberDataForPool,
} from "@/utils/recipePool";

function isPlanDebug(): boolean {
  if (typeof window === "undefined") return false;
  return (window as Window & { __PLAN_DEBUG?: boolean }).__PLAN_DEBUG === true || new URLSearchParams(window.location.search).get("debugPool") === "1";
}

export type ReplaceOccupiedMealContext = {
  slot: { id: string };
  plannedMeal: { id: string };
  recipe: { title: string };
  recipeId: string;
  /** После trial — false, чтобы сразу шёл Premium-путь. */
  isFreeTierForReplace: boolean;
};

export type ReplaceOccupiedMealDeps = {
  selectedDayKey: string;
  isInfantPlanUi: boolean;
  selectedMember: MembersRow | null | undefined;
  isAnyGenerating: boolean;
  toast: (opts: { description?: string; variant?: "destructive" | "default"; title?: string }) => void;
  appendInfantMatchedVariant: (p: { dayKey: string; mealType: string; recipeId: string; title: string }) => void;
  replacingSlotKey: string | null;
  setReplacingSlotKey: (v: string | null) => void;
  poolAutoReplaceCountBySlot: Record<string, number>;
  clearSlotAndOpenPoolFallback: (ctx: {
    dayKey: string;
    mealType: string;
    planSlotId: string | null;
    infantReason?: InfantPoolExhaustedReason;
    skipClear?: boolean;
  }) => Promise<void>;
  infantPoolMemberData: MemberDataForPool | null;
  user: { id: string } | null;
  mealPlanMemberId: string | undefined;
  infantDayReplaceExcludeRecipeIdsMerged: string[];
  infantDayReplaceExcludeTitleKeysMerged: string[];
  supabase: SupabaseClient;
  replaceSlotWithRecipe: (p: {
    dayKey: string;
    mealType: string;
    recipeId: string;
    recipeTitle: string;
  }) => Promise<void>;
  setSessionExcludeRecipeIds: Dispatch<SetStateAction<Record<string, string[]>>>;
  setSessionExcludeTitleKeys: Dispatch<SetStateAction<Record<string, string[]>>>;
  queryClient: QueryClient;
  mealPlansKeyWeek: unknown;
  mealPlansKeyDay: unknown;
  setPoolAutoReplaceCountBySlot: Dispatch<SetStateAction<Record<string, number>>>;
  replaceMealSlotAuto: (p: {
    dayKey: string;
    mealType: string;
    excludeRecipeIds: string[];
    excludeTitleKeys: string[];
    memberData?: {
      allergies?: string[] | null;
      likes?: string[] | null;
      dislikes?: string[] | null;
      age_months?: number | null;
    };
    isFree: boolean;
  }) => Promise<
    | { ok: true; newRecipeId: string; title: string; plan_source: "pool" | "ai"; pickedSource?: string; requestId?: string; reason?: string }
    | { ok: false; code?: string; error?: string; requestId?: string; reason?: string }
  >;
  replaceExcludeRecipeIdsMerged: string[];
  replaceExcludeTitleKeysMerged: string[];
  memberDataForPlan: { allergies?: string[] | null; likes?: string[] | null; dislikes?: string[] | null; age_months?: number | null } | null;
  setPaywallReason: (v: string | null) => void;
  setPaywallCustomMessage: (v: string | null) => void;
  setShowPaywall: (v: boolean) => void;
  setInfantReplacePrimaryConfirm: Dispatch<
    SetStateAction<{
      currentLabel: string;
      newLabel: string;
      picked: { id: string; title: string; firstNovelProductKey: string | null };
      slotId: string;
    } | null>
  >;
  getProductDisplayLabel: (key: string) => string;
};

/**
 * Замена блюда в занятом слоте (пул / infant pick / AI) — вынесено из MealPlanPage для повторного вызова после trial.
 */
export async function runReplaceOccupiedMealSlot(
  ctx: ReplaceOccupiedMealContext,
  deps: ReplaceOccupiedMealDeps
): Promise<void> {
  const {
    selectedDayKey,
    isInfantPlanUi,
    selectedMember,
    isAnyGenerating,
    toast,
    appendInfantMatchedVariant,
    replacingSlotKey,
    setReplacingSlotKey,
    poolAutoReplaceCountBySlot,
    clearSlotAndOpenPoolFallback,
    infantPoolMemberData,
    user,
    mealPlanMemberId,
    infantDayReplaceExcludeRecipeIdsMerged,
    infantDayReplaceExcludeTitleKeysMerged,
    supabase,
    replaceSlotWithRecipe,
    setSessionExcludeRecipeIds,
    setSessionExcludeTitleKeys,
    queryClient,
    mealPlansKeyWeek,
    mealPlansKeyDay,
    setPoolAutoReplaceCountBySlot,
    replaceMealSlotAuto,
    replaceExcludeRecipeIdsMerged,
    replaceExcludeTitleKeysMerged,
    memberDataForPlan,
    setPaywallReason,
    setPaywallCustomMessage,
    setShowPaywall,
    setInfantReplacePrimaryConfirm,
    getProductDisplayLabel,
  } = deps;

  const { slot, plannedMeal, recipe, recipeId, isFreeTierForReplace } = ctx;

  if (isAnyGenerating) {
    toast({ description: "Идёт генерация плана…" });
    return;
  }

  const isInfantPremiumAutoreplaceLocal = isInfantAutoreplaceContext({
    isInfantPlanUi,
    isFree: isFreeTierForReplace,
  });
  const slotAutoReplaceLimitLocal = getAutoReplaceLimitPerSlotPerDay({
    isInfantPremiumContext: isInfantPremiumAutoreplaceLocal,
  });

  if (import.meta.env.DEV) console.info("[REPLACE] source=AI premiumOnly", { dayKey: selectedDayKey, slot: slot.id });
  const slotKey = getSlotDayKey(selectedDayKey, slot.id);
  if (isInfantPremiumAutoreplaceLocal && recipeId && recipe?.title) {
    appendInfantMatchedVariant({
      dayKey: selectedDayKey,
      mealType: slot.id,
      recipeId,
      title: recipe.title,
    });
  }
  if (replacingSlotKey != null) return;
  if ((poolAutoReplaceCountBySlot[slotKey] ?? 0) >= slotAutoReplaceLimitLocal) {
    await clearSlotAndOpenPoolFallback({
      dayKey: selectedDayKey,
      mealType: slot.id,
      planSlotId: plannedMeal.id,
      infantReason: isInfantPremiumAutoreplaceLocal ? "limit_reached" : undefined,
      skipClear: isInfantPremiumAutoreplaceLocal,
    });
    return;
  }
  setReplacingSlotKey(slotKey);
  try {
    if (isInfantPremiumAutoreplaceLocal && infantPoolMemberData && user?.id && mealPlanMemberId) {
      const picked = isInfantNewRecipePlanSlot(slot.id)
        ? await pickInfantNewRecipe({
            supabase,
            userId: user.id,
            memberId: mealPlanMemberId,
            memberData: infantPoolMemberData,
            excludeRecipeIds: infantDayReplaceExcludeRecipeIdsMerged,
            excludeTitleKeys: infantDayReplaceExcludeTitleKeysMerged,
            limitCandidates: 150,
            plannedDayKey: selectedDayKey,
          })
        : await pickInfantFamiliarRecipe({
            supabase,
            userId: user.id,
            memberId: mealPlanMemberId,
            memberData: infantPoolMemberData,
            excludeRecipeIds: infantDayReplaceExcludeRecipeIdsMerged,
            excludeTitleKeys: infantDayReplaceExcludeTitleKeysMerged,
            limitCandidates: 150,
            plannedDayKey: selectedDayKey,
          });
      if (!picked) {
        await clearSlotAndOpenPoolFallback({
          dayKey: selectedDayKey,
          mealType: slot.id,
          planSlotId: plannedMeal.id,
          infantReason: "candidates_exhausted",
          skipClear: true,
        });
        return;
      }
      if (picked.id === recipeId) {
        toast({ description: "Нет других вариантов" });
        return;
      }
      const introKey = (selectedMember as MembersRow | undefined)?.introducing_product_key?.trim() ?? null;
      if (
        isInfantNewRecipePlanSlot(slot.id) &&
        introKey &&
        picked.firstNovelProductKey &&
        picked.firstNovelProductKey !== introKey
      ) {
        setInfantReplacePrimaryConfirm({
          currentLabel: getProductDisplayLabel(introKey),
          newLabel: getProductDisplayLabel(picked.firstNovelProductKey),
          picked: {
            id: picked.id,
            title: picked.title,
            firstNovelProductKey: picked.firstNovelProductKey,
          },
          slotId: slot.id,
        });
        return;
      }
      await replaceSlotWithRecipe({
        dayKey: selectedDayKey,
        mealType: slot.id,
        recipeId: picked.id,
        recipeTitle: picked.title,
      });
      setSessionExcludeRecipeIds((prev) => ({
        ...prev,
        [selectedDayKey]: [...(prev[selectedDayKey] ?? []), picked.id],
      }));
      setSessionExcludeTitleKeys((prev) => ({
        ...prev,
        [selectedDayKey]: [...(prev[selectedDayKey] ?? []), normalizeTitleKey(picked.title)],
      }));
      applyReplaceSlotToPlanCache(
        queryClient,
        { mealPlansKeyWeek, mealPlansKeyDay },
        {
          dayKey: selectedDayKey,
          mealType: slot.id,
          newRecipeId: picked.id,
          title: picked.title,
          plan_source: "pool",
        },
        mealPlanMemberId ?? null
      );
      setPoolAutoReplaceCountBySlot((prev) => ({
        ...prev,
        [slotKey]: (prev[slotKey] ?? 0) + 1,
      }));
      appendInfantMatchedVariant({
        dayKey: selectedDayKey,
        mealType: slot.id,
        recipeId: picked.id,
        title: picked.title,
      });
      toast({ description: "Блюдо заменено" });
      if (isPlanDebug()) {
        console.info("[replace_slot]", {
          requestId: undefined,
          dayKey: selectedDayKey,
          memberId: mealPlanMemberId,
          slot: slot.id,
          ok: true,
          reason: "client_pool_infant",
        });
      }
      return;
    }

    const result = await replaceMealSlotAuto({
      dayKey: selectedDayKey,
      mealType: slot.id,
      excludeRecipeIds: replaceExcludeRecipeIdsMerged,
      excludeTitleKeys: replaceExcludeTitleKeysMerged,
      memberData: memberDataForPlan
        ? {
            allergies: memberDataForPlan.allergies,
            likes: memberDataForPlan.likes,
            dislikes: memberDataForPlan.dislikes,
            age_months: memberDataForPlan.age_months,
          }
        : undefined,
      isFree: isFreeTierForReplace,
    });
    if (result.ok) {
      if (result.newRecipeId === recipeId) {
        toast({ description: "Нет других вариантов" });
        return;
      }
      setSessionExcludeRecipeIds((prev) => ({
        ...prev,
        [selectedDayKey]: [...(prev[selectedDayKey] ?? []), result.newRecipeId],
      }));
      setSessionExcludeTitleKeys((prev) => ({
        ...prev,
        [selectedDayKey]: [...(prev[selectedDayKey] ?? []), normalizeTitleKey(result.title)],
      }));
      applyReplaceSlotToPlanCache(
        queryClient,
        { mealPlansKeyWeek, mealPlansKeyDay },
        {
          dayKey: selectedDayKey,
          mealType: slot.id,
          newRecipeId: result.newRecipeId,
          title: result.title,
          plan_source: result.plan_source,
        },
        mealPlanMemberId ?? null
      );
      if (result.pickedSource === "pool" || result.plan_source === "pool") {
        setPoolAutoReplaceCountBySlot((prev) => ({
          ...prev,
          [slotKey]: (prev[slotKey] ?? 0) + 1,
        }));
      }
      if (isInfantPremiumAutoreplaceLocal) {
        appendInfantMatchedVariant({
          dayKey: selectedDayKey,
          mealType: slot.id,
          recipeId: result.newRecipeId,
          title: result.title,
        });
      }
      toast({
        description: result.pickedSource === "ai" ? "Подбираем новый вариант…" : "Блюдо заменено",
      });
      if (isPlanDebug()) {
        console.info("[replace_slot]", {
          requestId: result.requestId,
          dayKey: selectedDayKey,
          memberId: mealPlanMemberId,
          slot: slot.id,
          ok: true,
          reason: result.reason,
        });
      }
    } else {
      const code = (result as { code?: string }).code;
      if (code === "LIMIT_REACHED") {
        setPaywallReason("plan_refresh");
        setPaywallCustomMessage(`${getLimitReachedTitle("plan_refresh")}\n\n${getLimitReachedMessage("plan_refresh")}`);
        setShowPaywall(true);
      } else if (code === "pool_exhausted") {
        await clearSlotAndOpenPoolFallback({
          dayKey: selectedDayKey,
          mealType: slot.id,
          planSlotId: plannedMeal.id,
          infantReason: isInfantPremiumAutoreplaceLocal ? "candidates_exhausted" : undefined,
          skipClear: isInfantPremiumAutoreplaceLocal,
        });
      } else {
        const err = "error" in result ? result.error : "";
        if (err === "limit") {
          toast({
            variant: "destructive",
            title: "Лимит",
            description: "2 замены в день (Free). В Premium — без ограничений.",
          });
        } else if (err === "premium_required") {
          setPaywallReason("meal_replace");
          setPaywallCustomMessage(null);
          setShowPaywall(true);
        } else {
          toast({
            variant: "destructive",
            title: "Не удалось заменить",
            description: err === "unauthorized" ? "Нужна авторизация" : err,
          });
        }
      }
      if (isPlanDebug()) {
        console.info("[replace_slot]", {
          requestId: result.requestId,
          dayKey: selectedDayKey,
          memberId: mealPlanMemberId,
          slot: slot.id,
          ok: false,
          reason: result.reason,
          error: "error" in result ? result.error : undefined,
        });
      }
    }
  } catch (e: unknown) {
    toast({
      variant: "destructive",
      title: "Ошибка",
      description: e instanceof Error ? e.message : "Не удалось заменить",
    });
  } finally {
    setReplacingSlotKey(null);
  }
}
