import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeError } from "@/utils/safeLogger";
import { useAuth } from './useAuth';
import { useAppStore } from '@/store/useAppStore';
import { trackUsageEvent } from '@/utils/usageEvents';
import type { RecipeSuggestion } from '@/services/deepseek';

/** Рецепт в БД: в recipe_data JSONB сохраняются child_id/child_name. member_id в SavedFavorite — из favorites_v2 (для кого избранное). */
export type StoredRecipe = RecipeSuggestion & {
  child_id?: string;
  child_name?: string;
  member_id?: string | null;
  ingredientNames?: string[];
  ingredientTotalCount?: number;
};

export type FavoritesFilter = 'all' | 'family' | string;

export interface SavedFavorite {
  id: string;
  recipe: StoredRecipe;
  /** Для кого запись: null = Семья, иначе member_id из favorites_v2. */
  member_id: string | null;
  memberIds: string[];
  createdAt: string;
}

export interface FavoritePreview {
  title?: string;
  description?: string | null;
  cookTimeMinutes?: number | null;
  ingredientNames?: string[];
  chefAdvice?: string | null;
  advice?: string | null;
}

/** Query key для кэша: фильтр по профилю. */
export function favoritesKey(params: { userId: string | undefined; filter: FavoritesFilter }): unknown[] {
  return ['favorites', params.userId, params.filter];
}

export interface UseFavoritesOptions {
  /** When false, favorites query is not run (e.g. when another tab is active). Default true. */
  queryEnabled?: boolean;
}

export function useFavorites(filter: FavoritesFilter = 'all', options?: UseFavoritesOptions) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryEnabled = options?.queryEnabled !== false;

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: favoritesKey({ userId: user?.id, filter }),
    enabled: !!user && queryEnabled,
    queryFn: async () => {
      if (!user) return [];

      let query = supabase
        .from('favorites_v2')
        .select('id, recipe_id, member_id, created_at, recipe_data')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (filter === 'family') {
        query = query.is('member_id', null);
      } else if (filter !== 'all' && typeof filter === 'string') {
        query = query.eq('member_id', filter);
      }

      const { data: rows, error } = await query;

      if (error) {
        safeError('DB Error in useFavorites (query):', error.message, 'Details:', error.details);
        throw error;
      }

      const list = (rows ?? []) as { id: string; recipe_id: string; member_id: string | null; created_at?: string; recipe_data?: Record<string, unknown> | null }[];
      const recipeIds = [...new Set(list.map((r) => r.recipe_id).filter(Boolean))];
      if (recipeIds.length === 0) {
        return list.map((f) => ({
          id: f.id,
          recipe: { id: f.recipe_id } as StoredRecipe,
          member_id: f.member_id ?? null,
          memberIds: [] as string[],
          createdAt: f.created_at ?? f.id,
          _recipeId: f.recipe_id,
        })) as (SavedFavorite & { _recipeId?: string })[];
      }

      const { data: previewRows, error: rpcError } = await supabase.rpc('get_recipe_previews', {
        recipe_ids: recipeIds,
      });

      if (rpcError) {
        safeError('DB Error in useFavorites (get_recipe_previews):', rpcError.message);
      }

      const previewMap = new Map<string, { title: string; description: string | null; cooking_time_minutes: number | null; ingredient_names: string[]; ingredient_total_count: number }>();
      for (const r of (previewRows ?? []) as Array<{
        id: string;
        title: string | null;
        description: string | null;
        cooking_time_minutes: number | null;
        ingredient_names: string[] | null;
        ingredient_total_count: number | null;
      }>) {
        previewMap.set(r.id, {
          title: r.title ?? '',
          description: r.description ?? null,
          cooking_time_minutes: r.cooking_time_minutes ?? null,
          ingredient_names: Array.isArray(r.ingredient_names) ? r.ingredient_names : [],
          ingredient_total_count: typeof r.ingredient_total_count === 'number' ? r.ingredient_total_count : 0,
        });
      }

      const { data: recipeMetaRows } = await supabase
        .from('recipes')
        .select('id, member_id, chef_advice, advice, meal_type, calories, proteins, fats, carbs')
        .in('id', recipeIds);
      const memberIdByRecipeId = new Map<string, string | null>();
      const chefAdviceByRecipeId = new Map<string, string | null>();
      const adviceByRecipeId = new Map<string, string | null>();
      const mealTypeByRecipeId = new Map<string, string | null>();
      const nutritionByRecipeId = new Map<
        string,
        { calories: number | null; proteins: number | null; fats: number | null; carbs: number | null }
      >();
      for (const row of (recipeMetaRows ?? []) as {
        id: string;
        member_id: string | null;
        chef_advice?: string | null;
        advice?: string | null;
        meal_type?: string | null;
        calories?: number | null;
        proteins?: number | null;
        fats?: number | null;
        carbs?: number | null;
      }[]) {
        memberIdByRecipeId.set(row.id, row.member_id ?? null);
        chefAdviceByRecipeId.set(row.id, row.chef_advice ?? null);
        adviceByRecipeId.set(row.id, row.advice ?? null);
        mealTypeByRecipeId.set(row.id, row.meal_type ?? null);
        nutritionByRecipeId.set(row.id, {
          calories: row.calories ?? null,
          proteins: row.proteins ?? null,
          fats: row.fats ?? null,
          carbs: row.carbs ?? null,
        });
      }

      return list.map((f) => {
        const preview = previewMap.get(f.recipe_id);
        const mealTypeFromDb = mealTypeByRecipeId.get(f.recipe_id) ?? (f.recipe_data as { mealType?: string })?.mealType ?? null;
        const recipe: StoredRecipe = preview
          ? {
            id: f.recipe_id,
            title: preview.title,
            description: preview.description ?? null,
            cookingTime: preview.cooking_time_minutes ?? 0,
            ingredients: [],
            steps: [],
            ageRange: '',
            ingredientNames: preview.ingredient_names,
            ingredientTotalCount: preview.ingredient_total_count,
            member_id: memberIdByRecipeId.get(f.recipe_id) ?? undefined,
            ...(mealTypeFromDb && { mealType: mealTypeFromDb }),
          }
          : { id: f.recipe_id, member_id: memberIdByRecipeId.get(f.recipe_id) ?? undefined, ...(mealTypeFromDb && { mealType: mealTypeFromDb }) } as StoredRecipe;
        const chefFromDb = chefAdviceByRecipeId.get(f.recipe_id);
        const adviceFromDb = adviceByRecipeId.get(f.recipe_id);
        const nutrition = nutritionByRecipeId.get(f.recipe_id);
        if (typeof chefFromDb === 'string' && chefFromDb.trim()) {
          (recipe as StoredRecipe & { chefAdvice?: string }).chefAdvice = chefFromDb.trim();
        } else if (typeof (f.recipe_data as { chefAdvice?: string })?.chefAdvice === 'string' && (f.recipe_data as { chefAdvice: string }).chefAdvice.trim()) {
          (recipe as StoredRecipe & { chefAdvice?: string }).chefAdvice = (f.recipe_data as { chefAdvice: string }).chefAdvice.trim();
        }
        if (typeof adviceFromDb === 'string' && adviceFromDb.trim()) {
          (recipe as StoredRecipe & { advice?: string }).advice = adviceFromDb.trim();
        } else if (typeof (f.recipe_data as { advice?: string })?.advice === 'string' && (f.recipe_data as { advice: string }).advice.trim()) {
          (recipe as StoredRecipe & { advice?: string }).advice = (f.recipe_data as { advice: string }).advice.trim();
        }
        if (nutrition && (nutrition.calories != null || nutrition.proteins != null || nutrition.fats != null || nutrition.carbs != null)) {
          (recipe as StoredRecipe & { calories?: number | null; proteins?: number | null; fats?: number | null; carbs?: number | null }).calories = nutrition.calories;
          (recipe as StoredRecipe & { calories?: number | null; proteins?: number | null; fats?: number | null; carbs?: number | null }).proteins = nutrition.proteins;
          (recipe as StoredRecipe & { calories?: number | null; proteins?: number | null; fats?: number | null; carbs?: number | null }).fats = nutrition.fats;
          (recipe as StoredRecipe & { calories?: number | null; proteins?: number | null; fats?: number | null; carbs?: number | null }).carbs = nutrition.carbs;
        }
        return {
          id: f.id,
          recipe,
          member_id: f.member_id ?? null,
          memberIds: f.member_id ? [f.member_id] : [],
          createdAt: f.created_at ?? f.id,
          _recipeId: f.recipe_id,
        };
      }) as (SavedFavorite & { _recipeId?: string })[];
    },
  });

  const addFavorite = useMutation({
    mutationFn: async (params: {
      recipeId: string;
      memberId: string | null;
      recipeData?: FavoritePreview | Record<string, unknown>;
    }) => {
      if (!user) throw new Error('User not authenticated');
      const recipe_data = params.recipeData && typeof params.recipeData === 'object' && !Array.isArray(params.recipeData)
        ? (params.recipeData as Record<string, unknown>)
        : { id: params.recipeId };
      const { data, error } = await supabase
        .from('favorites_v2')
        .insert({
          user_id: user.id,
          recipe_id: params.recipeId,
          member_id: params.memberId,
          recipe_data,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['recipe_previews'] });
    },
  });

  const removeFavoriteByRowId = useMutation({
    mutationFn: async (favoriteId: string) => {
      if (!user) throw new Error('User not authenticated');
      const { error } = await supabase.from('favorites_v2').delete().eq('id', favoriteId).eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['recipe_previews'] });
    },
  });

  const removeFavoriteByRecipeAndMember = useMutation({
    mutationFn: async (params: { recipeId: string; memberId: string | null }) => {
      if (!user) throw new Error('User not authenticated');
      let q = supabase.from('favorites_v2').delete().eq('user_id', user.id).eq('recipe_id', params.recipeId);
      if (params.memberId == null) {
        q = q.is('member_id', null);
      } else {
        q = q.eq('member_id', params.memberId);
      }
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['recipe_previews'] });
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: async (params: {
      recipeId: string;
      memberId: string | null;
      isFavorite: boolean;
      recipeData?: FavoritePreview;
    }) => {
      if (!user) throw new Error('User not authenticated');
      const { recipeId, memberId, isFavorite, recipeData } = params;
      const recipe_data = isFavorite && recipeData
        ? {
            id: recipeId,
            title: recipeData.title ?? '',
            description: recipeData.description ?? null,
            cookingTime: recipeData.cookTimeMinutes ?? null,
            ingredients: (recipeData.ingredientNames ?? []).map((n) => ({ name: n })),
            ...(recipeData.chefAdvice != null && recipeData.chefAdvice !== '' && { chefAdvice: recipeData.chefAdvice }),
            ...(recipeData.advice != null && recipeData.advice !== '' && { advice: recipeData.advice }),
          }
        : isFavorite
          ? { id: recipeId }
          : null;
      const { data, error } = await supabase.rpc('toggle_favorite_v2', {
        p_recipe_id: recipeId,
        p_member_id: memberId,
        p_recipe_data: recipe_data,
      });
      if (error) throw error;
      const result = data as { ok: boolean; code?: string; limit?: number };
      if (!result.ok && result.code === 'favorites_limit_reached') {
        const err = new Error('В Free можно сохранить до 7 рецептов. Откройте Premium, чтобы сохранять без лимита.') as Error & { code?: string; limit?: number };
        err.code = 'favorites_limit_reached';
        err.limit = result.limit ?? 7;
        throw err;
      }
    },
    onSuccess: (_data, variables) => {
      trackUsageEvent(variables.isFavorite ? 'favorite_add' : 'favorite_remove', {
        properties: { recipe_id: variables.recipeId },
        memberId: variables.memberId,
      });
      queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['recipe_previews'] });
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === 'favorites_limit_reached') {
        useAppStore.getState().setShowFavoritesLimitSheet(true);
      }
    },
  });

  const isFavorite = useMemo(() => {
    const set = new Set(favorites.map((f) => `${(f as { _recipeId?: string })._recipeId ?? f.recipe?.id}:${(f as SavedFavorite).member_id ?? 'family'}`));
    return (recipeId: string, memberId: string | null) => set.has(`${recipeId}:${memberId ?? 'family'}`);
  }, [favorites]);

  const isFamilyFavorite = useMemo(() => {
    const familySet = new Set(
      favorites.filter((f) => (f as SavedFavorite).member_id == null).map((f) => (f as { _recipeId?: string })._recipeId ?? (f.recipe as { id?: string })?.id)
    );
    return (recipeId: string) => familySet.has(recipeId);
  }, [favorites]);

  const favoriteRecipeIds = useMemo(
    () =>
      new Set(
        favorites.flatMap((f) => {
          const id = (f as { _recipeId?: string })._recipeId ?? (f.recipe as { id?: string })?.id;
          return typeof id === 'string' && id.length > 0 ? [id] : [];
        })
      ),
    [favorites]
  );

  const getFavoriteId = useMemo(() => {
    const map = new Map(favorites.map((f) => [`${(f as { _recipeId?: string })._recipeId ?? f.recipe?.id}:${(f as SavedFavorite).member_id ?? 'family'}`, f.id]));
    return (recipeId: string, memberId: string | null) => map.get(`${recipeId}:${memberId ?? 'family'}`) ?? null;
  }, [favorites]);

  return {
    favorites,
    isLoading,
    isFavorite,
    isFamilyFavorite,
    favoriteRecipeIds,
    getFavoriteId,
    addFavorite: addFavorite.mutateAsync,
    removeFavorite: removeFavoriteByRowId.mutateAsync,
    removeFavoriteByRecipeAndMember: removeFavoriteByRecipeAndMember.mutateAsync,
    toggleFavorite: toggleFavorite.mutateAsync,
    isAdding: addFavorite.isPending,
    isRemoving: removeFavoriteByRowId.isPending,
    isToggling: toggleFavorite.isPending,
  };
}
