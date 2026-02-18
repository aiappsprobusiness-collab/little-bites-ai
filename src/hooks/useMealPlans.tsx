import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { formatLocalDate } from '@/utils/dateUtils';
import { isDateInRollingRange } from '@/utils/dateRange';
import { STARTER_DAILY_PLANS, STARTER_NEUTRAL_DAY } from '@/data/starterDailyPlans';
import { selectStarterVariant, STARTER_NEUTRAL_INDEX, type StarterProfile } from '@/data/starterResolver';
import { ensureStarterRecipesSeeded, toStarterRecipeDbId } from '@/data/starterRecipeSeed';
import type { MealPlansV2Row, MealPlansV2Insert, MealPlansV2Update } from '@/integrations/supabase/types-v2';

async function buildStarterItems(
  plannedDate: string,
  variantIndex: number,
  userId: string,
  memberId: string | null | undefined
): Promise<MealPlanItemV2[]> {
  await ensureStarterRecipesSeeded(userId);
  const useNeutral = variantIndex === STARTER_NEUTRAL_INDEX;
  const template = useNeutral ? STARTER_NEUTRAL_DAY : (STARTER_DAILY_PLANS[variantIndex] ?? STARTER_DAILY_PLANS[0]);
  const mid = memberId ?? null;
  const idPrefix = useNeutral ? `starter_neutral_${plannedDate}` : `starter_${plannedDate}`;
  return template.map((item) => {
    const starterId = item.recipe_id ?? item.recipe?.id;
    const dbId = starterId ? toStarterRecipeDbId(userId, starterId) : null;
    return {
      ...item,
      id: useNeutral ? `${idPrefix}_${item.meal_type}` : `${idPrefix}_${item.meal_type}_${variantIndex}`,
      planned_date: plannedDate,
      recipe_id: dbId,
      recipe: item.recipe && dbId ? { id: dbId, title: item.recipe.title } : item.recipe,
      child_id: mid,
      member_id: mid,
      user_id: userId,
      isStarter: true,
    };
  });
}

const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
type MealType = (typeof MEAL_SLOTS)[number];

/** V2: one row per day; meals = { breakfast?: { recipe_id, title?, plan_source? }, ... } */
type MealsJson = Record<string, { recipe_id?: string; title?: string; plan_source?: "pool" | "ai" } | undefined>;

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
  user_id?: string;
  is_completed?: boolean;
  /** true = starter, отсутствует/false = из БД */
  isStarter?: boolean;
  /** 'pool' = из БД (pool-first), 'ai' = сгенерировано AI. Для debug-бейджа DB/AI. */
  plan_source?: "pool" | "ai";
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
      plan_source: slot.plan_source,
    });
  }
  return result;
}

/** Единый формат query key для meal_plans_v2: invalidate/refetch по predicate работают предсказуемо. */
export function mealPlansKey(params: {
  userId: string | undefined;
  memberId: string | null | undefined;
  start: string;
  end?: string;
  profileKey?: string | null;
  mutedWeekKey?: string | null;
}): unknown[] {
  const k: unknown[] = ['meal_plans_v2', params.userId, params.memberId ?? null, params.start];
  if (params.end !== undefined) k.push(params.end);
  k.push(params.profileKey ?? null, params.mutedWeekKey ?? null);
  return k;
}

/** memberId: конкретный id = планы этого члена; null = "Семья" (member_id is null); undefined = не фильтровать. */
export function useMealPlans(
  memberId?: string | null,
  profile?: StarterProfile | null,
  options?: { mutedWeekKey?: string | null }
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const profileKey: string | null = profile
    ? [
        [...(profile.allergies ?? [])].sort().join(","),
        (profile.preferences ?? []).map((p) => String(p).trim().toLowerCase()).join("|"),
      ].join(";")
    : null;

  const mutedWeekKey = options?.mutedWeekKey ?? null;

  const getMealPlans = (startDate: Date, endDate: Date) => {
    const startStr = formatLocalDate(startDate);
    const endStr = formatLocalDate(endDate);
    return useQuery({
      queryKey: mealPlansKey({ userId: user?.id, memberId, start: startStr, end: endStr, profileKey, mutedWeekKey }),
      queryFn: async ({ signal }): Promise<MealPlanItemV2[]> => {
        if (!user) return [];
        let query = supabase
          .from('meal_plans_v2')
          .select('id, user_id, member_id, planned_date, meals')
          .eq('user_id', user.id)
          .gte('planned_date', startStr)
          .lte('planned_date', endStr);

        if (memberId === null) query = query.is('member_id', null);
        else if (memberId) query = query.eq('member_id', memberId);

        const { data: rows, error } = await query
          .abortSignal(signal)
          .order('planned_date', { ascending: true });

        if (error) throw error;
        const expanded = (rows ?? []).flatMap((r) => expandMealsRow(r as unknown as MealPlansV2Row));
        if ((rows ?? []).length > 0) {
          return expanded;
        }
        const rangeKeyForMute = startStr;
        if (mutedWeekKey !== null && rangeKeyForMute === mutedWeekKey) return [];
        const dates: string[] = [];
        const startD = new Date(startStr + 'T12:00:00');
        const endD = new Date(endStr + 'T12:00:00');
        for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
          dates.push(formatLocalDate(d));
        }
        const usedIndices = new Set<number>();
        const results: MealPlanItemV2[] = [];
        for (const d of dates) {
          const idx = selectStarterVariant(d, memberId, profile, usedIndices);
          if (idx >= 0) usedIndices.add(idx);
          const items = await buildStarterItems(d, idx, user.id, memberId);
          results.push(...items);
        }
        return results;
      },
      enabled: !!user,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    });
  };

  const getMealPlansByDate = (date: Date) => {
    const dateStr = formatLocalDate(date);
    return useQuery({
      queryKey: mealPlansKey({ userId: user?.id, memberId, start: dateStr, profileKey, mutedWeekKey }),
      queryFn: async ({ signal }): Promise<MealPlanItemV2[]> => {
        if (!user) return [];

        let query = supabase
          .from('meal_plans_v2')
          .select('id, user_id, member_id, planned_date, meals')
          .eq('user_id', user.id)
          .eq('planned_date', dateStr);

        if (memberId === null) query = query.is('member_id', null);
        else if (memberId) query = query.eq('member_id', memberId);

        const { data: rows, error } = await query.abortSignal(signal);

        if (error) throw error;
        const expanded = (rows ?? []).flatMap((r) => expandMealsRow(r as unknown as MealPlansV2Row));
        if ((rows ?? []).length > 0) {
          return expanded;
        }
        if (mutedWeekKey !== null && isDateInRollingRange(dateStr, mutedWeekKey)) return [];
        return await buildStarterItems(dateStr, selectStarterVariant(dateStr, memberId, profile), user.id, memberId);
      },
      enabled: !!user,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    });
  };

  /** Есть ли строка плана на дату и пустой ли день (meals = {}). Для различения EMPTY_DAY vs STARTER. */
  const getMealPlanRowExists = (date: Date) => {
    const dateStr = formatLocalDate(date);
    return useQuery({
      queryKey: [...mealPlansKey({ userId: user?.id, memberId, start: dateStr, profileKey, mutedWeekKey }), 'row_exists'] as const,
      queryFn: async ({ signal }): Promise<{ exists: boolean; isEmpty: boolean }> => {
        if (!user) return { exists: false, isEmpty: false };
        let query = supabase
          .from('meal_plans_v2')
          .select('id, meals')
          .eq('user_id', user.id)
          .eq('planned_date', dateStr);
        if (memberId === null) query = query.is('member_id', null);
        else if (memberId) query = query.eq('member_id', memberId);
        const { data: row, error } = await query.abortSignal(signal).maybeSingle();
        if (error) throw error;
        const exists = !!row;
        const meals = (row as { meals?: MealsJson } | null)?.meals ?? {};
        const isEmpty = exists && Object.keys(meals).length === 0;
        return { exists, isEmpty };
      },
      enabled: !!user,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
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
      const existingRow = existing as unknown as { id: string; meals?: MealsJson } | null;
      const currentMeals = (existingRow?.meals ?? {}) as MealsJson;
      const newMeals = {
        ...currentMeals,
        [mealType]: { recipe_id: payload.recipe_id, title: payload.title ?? undefined },
      };

      if (existingRow?.id) {
        const { data: updated, error } = await supabase
          .from('meal_plans_v2')
          .update({ meals: newMeals })
          .eq('id', existingRow.id)
          .select()
          .single();
        if (error) throw error;
        const slotCount = Object.keys(newMeals).filter((k) => (newMeals as MealsJson)[k]?.recipe_id).length;
        if (import.meta.env.DEV) {
          console.log("[PLAN save]", { dayKey: payload.planned_date, dayLabel: payload.planned_date, mealsCount: slotCount });
        }
        return updated as unknown as MealPlansV2Row;
      }

      const { data: inserted, error } = await supabase
        .from('meal_plans_v2')
        .insert({
          user_id: user.id,
          member_id,
          planned_date: payload.planned_date,
          meals: newMeals,
        } as unknown as MealPlansV2Insert)
        .select()
        .single();
      if (error) throw error;
      const slotCount = Object.keys(newMeals).filter((k) => (newMeals as MealsJson)[k]?.recipe_id).length;
      if (import.meta.env.DEV) {
        console.log("[PLAN save]", { dayKey: payload.planned_date, dayLabel: payload.planned_date, mealsCount: slotCount });
      }
      return inserted as unknown as MealPlansV2Row;
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
      return data as unknown as MealPlansV2Row;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans_v2', user?.id] });
    },
  });

  const deleteMealPlan = useMutation({
    mutationFn: async (id: string) => {
      if (!id) return;
      const match = id.match(/^(.+)_(breakfast|lunch|snack|dinner)$/);
      if (!match) throw new Error('Invalid meal plan id');
      const [, rowId, mealType] = match;

      const { data: row, error: fetchError } = await supabase
        .from('meal_plans_v2')
        .select('meals')
        .eq('id', rowId)
        .single();
      if (fetchError || !row) return;
      const rowData = row as unknown as { meals?: MealsJson };
      const meals = { ...(rowData.meals ?? {}) } as MealsJson;
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
      if (!id) return;
      const match = id.match(/^(.+)_(breakfast|lunch|snack|dinner)$/);
      if (!match) throw new Error('Invalid meal plan id');
      const [, rowId, mealType] = match;

      const { data: row, error: fetchError } = await supabase
        .from('meal_plans_v2')
        .select('meals')
        .eq('id', rowId)
        .single();
      if (fetchError || !row) return;
      const rowData = row as unknown as { meals?: MealsJson };
      const meals = { ...(rowData.meals ?? {}) } as MealsJson;
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

  /** Очистка дня/недели: только обнуляем meals у существующих строк. Генерация не вызывается. */
  const clearWeekPlan = useMutation({
    mutationFn: async ({ startDate, endDate }: { startDate: Date; endDate: Date }) => {
      if (!user) throw new Error('User not authenticated');

      const startStr = formatLocalDate(startDate);
      const endStr = formatLocalDate(endDate);

      console.log('[clearWeekPlan] start', {
        userId: user.id,
        memberId: memberId ?? 'null',
        startKey: startStr,
        endKey: endStr,
      });

      let query = supabase
        .from('meal_plans_v2')
        .select('id, planned_date, meals')
        .eq('user_id', user.id)
        .gte('planned_date', startStr)
        .lte('planned_date', endStr);

      if (memberId != null && memberId !== '') {
        query = query.eq('member_id', memberId);
      } else {
        query = query.is('member_id', null);
      }

      const { data: rows, error: fetchError } = await query;
      if (fetchError) {
        console.error('[clearWeekPlan] select error', fetchError);
        throw fetchError;
      }

      const rowList = (rows ?? []) as { id: string; planned_date: string; meals?: MealsJson }[];
      console.log('[clearWeekPlan] rows found', rowList.length, rowList.map((r) => ({ id: r.id, day_key: r.planned_date, meals_keys: Object.keys(r.meals ?? {}) })));

      if (rowList.length === 0) {
        console.warn('[clearWeekPlan] no rows to clear — check filter (member_id / date range)');
        return;
      }

      for (const row of rowList) {
        const { data: updated, error: updateError } = await supabase
          .from('meal_plans_v2')
          .update({ meals: {} })
          .eq('id', row.id)
          .select('id, planned_date, meals')
          .single();
        if (updateError) {
          console.error('[clearWeekPlan] update error', { rowId: row.id, day_key: row.planned_date, error: updateError });
          throw updateError;
        }
        console.log('[clearWeekPlan] updated', { id: updated?.id, day_key: (updated as { planned_date?: string })?.planned_date, meals: (updated as { meals?: unknown })?.meals });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'meal_plans_v2' });
      queryClient.refetchQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'meal_plans_v2' });
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
        const d = formatLocalDate(r.date);
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
      return (data ?? []) as unknown as MealPlansV2Row[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans_v2', user?.id] });
    },
  });

  return {
    getMealPlans,
    getMealPlansByDate,
    getMealPlanRowExists,
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
