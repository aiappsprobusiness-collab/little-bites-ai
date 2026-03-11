import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { formatLocalDate } from "@/utils/dateUtils";
import { addDays } from "@/utils/dateRange";

type MealsSlot = { recipe_id?: string; servings?: number };
type MealsJson = Record<string, MealsSlot | undefined>;

/**
 * Стабильная подпись плана для диапазона/профиля: по ней определяем, изменилось ли меню
 * после последней синхронизации списка покупок.
 */
export function usePlanSignature(range: "today" | "week", memberId: string | null | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["plan_signature", user?.id, range, memberId ?? "family"],
    queryFn: async (): Promise<string> => {
      if (!user) return "";
      const startDate = new Date();
      const endDate = range === "today" ? startDate : addDays(startDate, 6);
      const startStr = formatLocalDate(startDate);
      const endStr = formatLocalDate(endDate);

      let planQuery = supabase
        .from("meal_plans_v2")
        .select("planned_date, meals")
        .eq("user_id", user.id)
        .gte("planned_date", startStr)
        .lte("planned_date", endStr);
      if (memberId === null) planQuery = planQuery.is("member_id", null);
      else if (memberId) planQuery = planQuery.eq("member_id", memberId);

      const { data: planRows, error } = await planQuery.order("planned_date", { ascending: true });
      if (error) throw error;

      const slots: { date: string; meal: string; recipe_id: string; servings: number }[] = [];
      for (const row of planRows ?? []) {
        const meals = (row as { meals?: MealsJson }).meals ?? {};
        for (const mealType of ["breakfast", "lunch", "snack", "dinner"]) {
          const slot = meals[mealType];
          if (slot?.recipe_id) {
            slots.push({
              date: (row as { planned_date: string }).planned_date,
              meal: mealType,
              recipe_id: slot.recipe_id,
              servings: typeof slot.servings === "number" && slot.servings >= 1 ? slot.servings : 1,
            });
          }
        }
      }
      slots.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        if (a.meal !== b.meal) return a.meal.localeCompare(b.meal);
        if (a.recipe_id !== b.recipe_id) return a.recipe_id.localeCompare(b.recipe_id);
        return a.servings - b.servings;
      });
      return JSON.stringify(slots);
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
