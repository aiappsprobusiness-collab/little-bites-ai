import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { mealPlansKey } from "./useMealPlans";
import { formatLocalDate } from "@/utils/dateUtils";
import { getRollingStartKey, getRollingEndKey, getRollingDayKeys } from "@/utils/dateRange";

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
      queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
      const startKey = getRollingStartKey();
      const endKey = getRollingEndKey();
      queryClient.invalidateQueries({
        queryKey: mealPlansKey({
          userId: user?.id,
          memberId: variables.member_id ?? undefined,
          start: startKey,
          end: endKey,
        }),
      });
      const dayKey = variables.day_key;
      queryClient.invalidateQueries({
        queryKey: mealPlansKey({
          userId: user?.id,
          memberId: variables.member_id ?? undefined,
          start: dayKey,
        }),
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
