import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { RECIPES_LIST_SELECT } from '@/lib/supabase-constants';

type MealPlan = Tables<'meal_plans'>;
type MealPlanInsert = TablesInsert<'meal_plans'>;
type MealPlanUpdate = TablesUpdate<'meal_plans'>;
type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_PLANS_RECIPE_SELECT = `*, recipe:recipes(${RECIPES_LIST_SELECT})`;

/** childId: конкретный id = планы ребёнка; null = режим "Семья" (child_id is null); undefined = не фильтровать (все). */
export function useMealPlans(childId?: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const getMealPlans = (startDate: Date, endDate: Date) => {
    return useQuery({
      queryKey: ['meal_plans', user?.id, childId, startDate.toISOString(), endDate.toISOString()],
      queryFn: async () => {
        if (!user) return [];

        let query = supabase
          .from('meal_plans')
          .select(MEAL_PLANS_RECIPE_SELECT)
          .eq('user_id', user.id)
          .gte('planned_date', startDate.toISOString().split('T')[0])
          .lte('planned_date', endDate.toISOString().split('T')[0]);

        if (childId === null) query = query.is('child_id', null);
        else if (childId) query = query.eq('child_id', childId);

        const { data, error } = await query.order('planned_date', { ascending: true }).limit(7 * 4 * 2);

        if (error) throw error;
        return data as (MealPlan & { recipe: Tables<'recipes'> })[];
      },
      enabled: !!user,
    });
  };

  const getMealPlansByDate = (date: Date) => {
    return useQuery({
      queryKey: ['meal_plans', user?.id, childId, date.toISOString().split('T')[0]],
      queryFn: async () => {
        if (!user) return [];

        const dateStr = date.toISOString().split('T')[0];
        let query = supabase
          .from('meal_plans')
          .select(MEAL_PLANS_RECIPE_SELECT)
          .eq('user_id', user.id)
          .eq('planned_date', dateStr);

        if (childId === null) query = query.is('child_id', null);
        else if (childId) query = query.eq('child_id', childId);

        const { data, error } = await query.order('meal_type', { ascending: true }).limit(10);

        if (error) throw error;
        return data as (MealPlan & { recipe: Tables<'recipes'> })[];
      },
      enabled: !!user,
    });
  };

  // Создать план питания
  const createMealPlan = useMutation({
    mutationFn: async (mealPlanData: Omit<MealPlanInsert, 'user_id'>) => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('meal_plans')
        .insert({
          ...mealPlanData,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as MealPlan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans', user?.id] });
    },
  });

  // Обновить план питания
  const updateMealPlan = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & MealPlanUpdate) => {
      const { data, error } = await supabase
        .from('meal_plans')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as MealPlan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans', user?.id] });
    },
  });

  // Удалить план питания
  const deleteMealPlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('meal_plans')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans', user?.id] });
    },
  });

  // Отметить план как выполненный
  const markAsCompleted = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('meal_plans')
        .update({ is_completed: true })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as MealPlan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans', user?.id] });
    },
  });

  // Очистить план на неделю
  const clearWeekPlan = useMutation({
    mutationFn: async ({ startDate, endDate }: { startDate: Date; endDate: Date }) => {
      if (!user) throw new Error('User not authenticated');

      let query = supabase
        .from('meal_plans')
        .delete()
        .eq('user_id', user.id)
        .gte('planned_date', startDate.toISOString().split('T')[0])
        .lte('planned_date', endDate.toISOString().split('T')[0]);

      if (childId != null && childId !== '') {
        query = query.eq('child_id', childId);
      } else {
        query = query.is('child_id', null);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans', user?.id] });
    },
  });

  // Создать план на неделю (автозаполнение)
  const createWeekPlan = useMutation({
    mutationFn: async ({
      startDate,
      recipes,
    }: {
      startDate: Date;
      recipes: { date: Date; mealType: MealType; recipeId: string }[];
    }) => {
      if (!user) throw new Error('User not authenticated');

      const mealPlans = recipes.map(({ date, mealType, recipeId }) => ({
        user_id: user.id,
        child_id: childId || null,
        recipe_id: recipeId,
        planned_date: date.toISOString().split('T')[0],
        meal_type: mealType,
        is_completed: false,
      }));

      const { data, error } = await supabase
        .from('meal_plans')
        .insert(mealPlans)
        .select();

      if (error) throw error;
      return data as MealPlan[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans', user?.id] });
    },
  });

  return {
    getMealPlans,
    getMealPlansByDate,
    createMealPlan: createMealPlan.mutateAsync,
    updateMealPlan: updateMealPlan.mutateAsync,
    deleteMealPlan: deleteMealPlan.mutateAsync,
    clearWeekPlan: clearWeekPlan.mutateAsync,
    markAsCompleted: markAsCompleted.mutateAsync,
    createWeekPlan: createWeekPlan.mutateAsync,
    isCreating: createMealPlan.isPending,
    isUpdating: updateMealPlan.isPending,
    isDeleting: deleteMealPlan.isPending,
  };
}
