import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { formatLocalDate } from "@/utils/dateUtils";
import { getRollingDayKeys } from "@/utils/dateRange";
import { invalidateMealPlanQueriesForPlannedDate } from "@/utils/mealPlanQueryInvalidation";

export interface AssignRecipeToPlanSlotParams {
  member_id: string | null;
  day_key: string;
  meal_type: string;
  recipe_id: string;
  recipe_title?: string | null;
  /** Порции (опционально; в БД два overload — передаём явно, чтобы вызывалась версия с p_servings). */
  servings?: number | null;
}

export function useAssignRecipeToPlanSlot(memberId: string | null | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (params: AssignRecipeToPlanSlotParams) => {
      if (!user) throw new Error("User not authenticated");
      const { data, error } = await supabase.rpc("assign_recipe_to_plan_slot", {
        p_member_id: params.member_id,
        p_day_key: params.day_key,
        p_meal_type: params.meal_type,
        p_recipe_id: params.recipe_id,
        p_recipe_title: params.recipe_title ?? null,
        p_servings: params.servings ?? null,
      });
      if (error) throw error;
      return data as { id: string; planned_date: string; meal_type: string; recipe_id: string; title: string };
    },
    onSuccess: (_data, variables) => {
      void invalidateMealPlanQueriesForPlannedDate(queryClient, {
        userId: user?.id,
        plannedDate: variables.day_key,
      });
    },
  });

  return {
    assignRecipeToPlanSlot: mutation.mutateAsync,
    isAssigning: mutation.isPending,
    error: mutation.error,
  };
}

export { getRollingDayKeys, formatLocalDate };
