import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type MealPlan = Tables<'meal_plans'>;
type MealPlanInsert = TablesInsert<'meal_plans'>;
type MealPlanUpdate = TablesUpdate<'meal_plans'>;
type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export function useMealPlans(childId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Получить планы питания за период
  const getMealPlans = (startDate: Date, endDate: Date) => {
    return useQuery({
      queryKey: ['meal_plans', user?.id, childId, startDate.toISOString(), endDate.toISOString()],
      queryFn: async () => {
        if (!user) return [];

        let query = supabase
          .from('meal_plans')
          .select(`
            *,
            recipe:recipes(*)
          `)
          .eq('user_id', user.id)
          .gte('planned_date', startDate.toISOString().split('T')[0])
          .lte('planned_date', endDate.toISOString().split('T')[0]);

        if (childId) {
          query = query.eq('child_id', childId);
        }

        const { data, error } = await query.order('planned_date', { ascending: true });

        if (error) throw error;
        return data as (MealPlan & { recipe: Tables<'recipes'> })[];
      },
      enabled: !!user,
    });
  };

  // Получить планы питания на конкретную дату
  const getMealPlansByDate = (date: Date) => {
    return useQuery({
      queryKey: ['meal_plans', user?.id, childId, date.toISOString().split('T')[0]],
      queryFn: async () => {
        if (!user) return [];

        const dateStr = date.toISOString().split('T')[0];

        let query = supabase
          .from('meal_plans')
          .select(`
            *,
            recipe:recipes(*)
          `)
          .eq('user_id', user.id)
          .eq('planned_date', dateStr);

        if (childId) {
          query = query.eq('child_id', childId);
        }

        const { data, error } = await query.order('meal_type', { ascending: true });

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
    markAsCompleted: markAsCompleted.mutateAsync,
    createWeekPlan: createWeekPlan.mutateAsync,
    isCreating: createMealPlan.isPending,
    isUpdating: updateMealPlan.isPending,
    isDeleting: deleteMealPlan.isPending,
  };
}
