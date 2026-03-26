import { useMemo } from "react";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { getRollingStartKey } from "@/utils/dateRange";

export const MEAL_PLAN_MUTED_WEEK_STORAGE_KEY = "mealPlan_mutedWeekKey";

/** Тот же ключ `mutedWeekKey`, что начальное состояние на MealPlanPage — для совпадения queryKey с RecipePage. */
export function readMealPlanMutedWeekKeyFromStorage(): string | null {
  if (typeof localStorage === "undefined") return null;
  const stored = localStorage.getItem(MEAL_PLAN_MUTED_WEEK_STORAGE_KEY);
  const currentStart = getRollingStartKey();
  return stored === currentStart ? stored : null;
}

export type MealPlanMemberDataForEdge = {
  name: string;
  type: string;
  allergies: string[];
  likes: string[];
  dislikes: string[];
  introduced_product_keys?: string[];
  introducing_product_key?: string | null;
  introducing_started_at?: string | null;
  /** Не подставлять 0 при отсутствии возраста — иначе Edge считает профиль «младенческим». */
  age_months?: number;
};

/**
 * Профиль для Edge / useMealPlans profileKey — должен совпадать на MealPlanPage и RecipePage,
 * иначе разные queryKey и «мигание» порций при открытии рецепта из плана.
 */
export function useMealPlanMemberData(): {
  memberDataForPlan: MealPlanMemberDataForEdge | null;
  starterProfile: { allergies: string[]; likes: string[]; dislikes: string[] } | null;
} {
  const { hasAccess } = useSubscription();
  const isFree = !hasAccess;
  const { selectedMember, selectedMemberId, members } = useFamily();
  const isFamilyMode = !isFree && selectedMemberId === "family";

  const memberDataForPlan = useMemo((): MealPlanMemberDataForEdge | null => {
    if (isFamilyMode && members.length > 0) {
      const allAllergies = Array.from(new Set(members.flatMap((c) => c.allergies ?? [])));
      const allLikes = Array.from(
        new Set(
          members
            .flatMap((c) => (c as { likes?: string[] }).likes ?? [])
            .map((p) => String(p).trim())
            .filter(Boolean)
        )
      );
      const allDislikes = Array.from(
        new Set(
          members
            .flatMap((c) => (c as { dislikes?: string[] }).dislikes ?? [])
            .map((p) => String(p).trim())
            .filter(Boolean)
        )
      );
      return {
        name: "Семья",
        type: "family",
        allergies: allAllergies,
        likes: allLikes,
        dislikes: allDislikes,
        introduced_product_keys: [],
      };
    }
    const memberForPlan = selectedMember ?? (isFree && selectedMemberId === "family" && members.length > 0 ? members[0] : null);
    if (memberForPlan) {
      const m = memberForPlan as { allergies?: string[]; likes?: string[]; dislikes?: string[]; type?: string };
      return {
        name: memberForPlan.name,
        ...(memberForPlan.age_months != null && Number.isFinite(memberForPlan.age_months)
          ? { age_months: Math.max(0, Math.round(memberForPlan.age_months)) }
          : {}),
        type: m.type ?? "child",
        allergies: m.allergies ?? [],
        likes: m.likes ?? [],
        dislikes: m.dislikes ?? [],
        introduced_product_keys: Array.isArray((memberForPlan as { introduced_product_keys?: unknown }).introduced_product_keys)
          ? ((memberForPlan as { introduced_product_keys: string[] }).introduced_product_keys ?? [])
          : [],
        introducing_product_key:
          typeof (memberForPlan as { introducing_product_key?: unknown }).introducing_product_key === "string" &&
          (memberForPlan as { introducing_product_key: string }).introducing_product_key.trim()
            ? (memberForPlan as { introducing_product_key: string }).introducing_product_key.trim()
            : null,
        introducing_started_at:
          typeof (memberForPlan as { introducing_started_at?: unknown }).introducing_started_at === "string" &&
          (memberForPlan as { introducing_started_at: string }).introducing_started_at.trim()
            ? (memberForPlan as { introducing_started_at: string }).introducing_started_at.trim().slice(0, 10)
            : null,
      };
    }
    return null;
  }, [isFamilyMode, members, selectedMember, isFree, selectedMemberId]);

  const starterProfile = memberDataForPlan
    ? {
        allergies: memberDataForPlan.allergies,
        likes: memberDataForPlan.likes,
        dislikes: memberDataForPlan.dislikes,
      }
    : null;

  return { memberDataForPlan, starterProfile };
}
