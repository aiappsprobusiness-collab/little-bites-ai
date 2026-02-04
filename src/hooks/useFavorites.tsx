import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { RecipeSuggestion } from '@/services/deepseek';

/** Рецепт в БД: в recipe_data JSONB сохраняются child_id/child_name (контекст при добавлении из чата, ключи в БД не меняем). */
export type StoredRecipe = RecipeSuggestion & { child_id?: string; child_name?: string };

export interface SavedFavorite {
  id: string;
  recipe: StoredRecipe;
  memberIds: string[];
  createdAt: string;
}

export function useFavorites() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Получить все избранные рецепты (таблица favorites_v2: recipe_data jsonb, created_at)
  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ['favorites', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('favorites_v2')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('DB Error in useFavorites (query):', error.message, 'Details:', error.details);
        throw error;
      }

      return (data || []).map((f: { id: string; recipe_data?: unknown; recipe?: unknown; created_at?: string }) => ({
        id: f.id,
        recipe: ((f.recipe_data ?? f.recipe) ?? {}) as StoredRecipe,
        memberIds: [],
        createdAt: f.created_at ?? f.id,
      })) as SavedFavorite[];
    },
    enabled: !!user,
  });

  const addFavorite = useMutation({
    mutationFn: async ({
      recipe,
      memberIds = [],
      memberId,
      memberName,
    }: {
      recipe: RecipeSuggestion;
      memberIds?: string[];
      memberId?: string;
      memberName?: string;
    }) => {
      if (!user) throw new Error('User not authenticated');

      const recipePayload = {
        ...recipe,
        ...(memberId != null && { child_id: memberId }),
        ...(memberName != null && memberName !== '' && { child_name: memberName }),
      };

      const { data, error } = await supabase
        .from('favorites_v2')
        .insert({
          user_id: user.id,
          recipe_data: recipePayload as Record<string, unknown>,
        })
        .select()
        .single();

      if (error) {
        console.error('DB Error in useFavorites addFavorite:', error.message, 'Details:', error.details);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
    },
  });

  // Удалить из избранного
  const removeFavorite = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('User not authenticated');
      const { error } = await supabase.from('favorites_v2').delete().eq('id', id);

      if (error) {
        console.error('DB Error in useFavorites removeFavorite:', error.message, 'Details:', error.details);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
    },
  });

  return {
    favorites,
    isLoading,
    addFavorite: addFavorite.mutateAsync,
    removeFavorite: removeFavorite.mutateAsync,
    isAdding: addFavorite.isPending,
    isRemoving: removeFavorite.isPending,
  };
}
