import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { MealPlansV2Row, MealPlansV2Insert, MealPlansV2Update } from '@/integrations/supabase/types-v2';

const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
type MealType = (typeof MEAL_SLOTS)[number];

/** V2: one row per day; meals = { breakfast?: { recipe_id, title? }, ... } */
type MealsJson = Record<string, { recipe_id?: string; title?: string } | undefined>;

/** Expanded item for UI compatibility: one "row" per meal slot (like old meal_plans). */
export interface MealPlanItemV2 {
  id: string;
  planned_date: string;
  meal_type: string;
  recipe_id: string | null;
  recipe: { id: string; title: string } | null;
  /** Alias for member_id so existing UI (ProfilePage, FamilyDashboard) keeps working */
  child_id: string | null;
  member_id: string | null;
  is_completed?: boolean;
}

function expandMealsRow(row: MealPlansV2Row): MealPlanItemV2[] {
  const meals = (row.meals as MealsJson) ?? {};
  const result: MealPlanItemV2[] = [];
  for (const mealType of MEAL_SLOTS) {
    const slot = meals[mealType];
    if (!slot?.recipe_id) continue;
    result.push({
      id: `${row.id}_${mealType}`,
      planned_date: row.planned_date,
      meal_type: mealType,
      recipe_id: slot.recipe_id,
      recipe: slot.title ? { id: slot.recipe_id, title: slot.title } : null,
      child_id: row.member_id,
      member_id: row.member_id,
    });
  }
  return result;
}

/** memberId: конкретный id = планы этого члена; null = "Семья" (member_id is null); undefined = не фильтровать. */
export function useMealPlans(memberId?: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const getMealPlans = (startDate: Date, endDate: Date) => {
    return useQuery({
      queryKey: ['meal_plans_v2', user?.id, memberId, startDate.toISOString(), endDate.toISOString()],
      queryFn: async (): Promise<MealPlanItemV2[]> => {
        if (!user) return [];

        let query = supabase
          .from('meal_plans_v2')
          .select('id, user_id, member_id, planned_date, meals')
          .eq('user_id', user.id)
          .gte('planned_date', startDate.toISOString().split('T')[0])
          .lte('planned_date', endDate.toISOString().split('T')[0]);

        if (memberId === null) query = query.is('member_id', null);
        else if (memberId) query = query.eq('member_id', memberId);

        const { data: rows, error } = await query.order('planned_date', { ascending: true });

        if (error) throw error;
        const expanded = (rows ?? []).flatMap((r) => expandMealsRow(r as MealPlansV2Row));
        return expanded;
      },
      enabled: !!user,
    });
  };

  const getMealPlansByDate = (date: Date) => {
    return useQuery({
      queryKey: ['meal_plans_v2', user?.id, memberId, date.toISOString().split('T')[0]],
      queryFn: async (): Promise<MealPlanItemV2[]> => {
        if (!user) return [];

        const dateStr = date.toISOString().split('T')[0];
        let query = supabase
          .from('meal_plans_v2')
          .select('id, user_id, member_id, planned_date, meals')
          .eq('user_id', user.id)
          .eq('planned_date', dateStr);

        if (memberId === null) query = query.is('member_id', null);
        else if (memberId) query = query.eq('member_id', memberId);

        const { data: rows, error } = await query;

        if (error) throw error;
        return (rows ?? []).flatMap((r) => expandMealsRow(r as MealPlansV2Row));
      },
      enabled: !!user,
    });
  };

  const createMealPlan = useMutation({
    mutationFn: async (
      payload: {
        child_id?: string | null;
        member_id?: string | null;
        recipe_id: string;
        planned_date: string;
        meal_type: string;
        is_completed?: boolean;
        title?: string;
      }
    ) => {
      if (!user) throw new Error('User not authenticated');

      const member_id = payload.member_id ?? payload.child_id ?? null;
      const mealType = payload.meal_type as MealType;
      if (!MEAL_SLOTS.includes(mealType)) throw new Error('Invalid meal_type');

      let existingQuery = supabase
        .from('meal_plans_v2')
        .select('id, meals')
        .eq('user_id', user.id)
        .eq('planned_date', payload.planned_date);
      if (member_id == null) {
        existingQuery = existingQuery.is('member_id', null);
      } else {
        existingQuery = existingQuery.eq('member_id', member_id);
      }
      const { data: existing } = await existingQuery.maybeSingle();

      const currentMeals = ((existing as { meals?: MealsJson } | null)?.meals ?? {}) as MealsJson;
      const newMeals = {
        ...currentMeals,
        [mealType]: { recipe_id: payload.recipe_id, title: payload.title ?? undefined },
      };

      if (existing?.id) {
        const { data: updated, error } = await supabase
          .from('meal_plans_v2')
          .update({ meals: newMeals })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return updated as MealPlansV2Row;
      }

      const { data: inserted, error } = await supabase
        .from('meal_plans_v2')
        .insert({
          user_id: user.id,
          member_id,
          planned_date: payload.planned_date,
          meals: newMeals,
        } as MealPlansV2Insert)
        .select()
        .single();
      if (error) throw error;
      return inserted as MealPlansV2Row;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans_v2', user?.id] });
    },
  });

  const updateMealPlan = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & MealPlansV2Update) => {
      const { data, error } = await supabase
        .from('meal_plans_v2')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as MealPlansV2Row;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans_v2', user?.id] });
    },
  });

  const deleteMealPlan = useMutation({
    mutationFn: async (id: string) => {
      const match = id.match(/^(.+)_(breakfast|lunch|snack|dinner)$/);
      if (!match) throw new Error('Invalid meal plan id');
      const [, rowId, mealType] = match;

      const { data: row, error: fetchError } = await supabase
        .from('meal_plans_v2')
        .select('meals')
        .eq('id', rowId)
        .single();
      if (fetchError || !row) throw fetchError || new Error('Plan not found');

      const meals = { ...(row.meals as MealsJson) };
      delete meals[mealType];

      const { error: updateError } = await supabase
        .from('meal_plans_v2')
        .update({ meals })
        .eq('id', rowId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans_v2', user?.id] });
    },
  });

  const markAsCompleted = useMutation({
    mutationFn: async (id: string) => {
      const match = id.match(/^(.+)_(breakfast|lunch|snack|dinner)$/);
      if (!match) throw new Error('Invalid meal plan id');
      const [, rowId, mealType] = match;

      const { data: row, error: fetchError } = await supabase
        .from('meal_plans_v2')
        .select('meals')
        .eq('id', rowId)
        .single();
      if (fetchError || !row) throw fetchError || new Error('Plan not found');

      const meals = { ...(row.meals as MealsJson) };
      const slot = meals[mealType];
      if (slot && typeof slot === 'object') {
        (meals as Record<string, unknown>)[mealType] = { ...slot, completed: true };
      }

      const { error: updateError } = await supabase
        .from('meal_plans_v2')
        .update({ meals })
        .eq('id', rowId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans_v2', user?.id] });
    },
  });

  const clearWeekPlan = useMutation({
    mutationFn: async ({ startDate, endDate }: { startDate: Date; endDate: Date }) => {
      if (!user) throw new Error('User not authenticated');

      let query = supabase
        .from('meal_plans_v2')
        .delete()
        .eq('user_id', user.id)
        .gte('planned_date', startDate.toISOString().split('T')[0])
        .lte('planned_date', endDate.toISOString().split('T')[0]);

      if (memberId != null && memberId !== '') {
        query = query.eq('member_id', memberId);
      } else {
        query = query.is('member_id', null);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans_v2', user?.id] });
    },
  });

  const createWeekPlan = useMutation({
    mutationFn: async ({
      startDate,
      recipes,
    }: {
      startDate: Date;
      recipes: { date: Date; mealType: MealType; recipeId: string; title?: string }[];
    }) => {
      if (!user) throw new Error('User not authenticated');

      const byDate = new Map<string, { mealType: MealType; recipeId: string; title?: string }[]>();
      for (const r of recipes) {
        const d = r.date.toISOString().split('T')[0];
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d)!.push({ mealType: r.mealType, recipeId: r.recipeId, title: r.title });
      }

      const rows: MealPlansV2Insert[] = [];
      for (const [planned_date, dayMeals] of byDate) {
        const meals: MealsJson = {};
        for (const m of dayMeals) {
          meals[m.mealType] = { recipe_id: m.recipeId, title: m.title };
        }
        rows.push({
          user_id: user.id,
          member_id: memberId ?? null,
          planned_date,
          meals,
        });
      }

      const { data, error } = await supabase.from('meal_plans_v2').insert(rows).select();
      if (error) throw error;
      return (data ?? []) as MealPlansV2Row[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans_v2', user?.id] });
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
