import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { RecipeSuggestion } from '@/services/deepseek';

/** Рецепт в БД может содержать child_id/child_name (контекст при добавлении из чата) */
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

  // Получить все избранные рецепты
  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ['favorites', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('DB Error in useFavorites (query):', error.message, 'Details:', error.details);
        throw error;
      }

      return (data || []).map((f) => ({
        id: f.id,
        recipe: f.recipe as StoredRecipe,
        memberIds: [], // Убрано из схемы, оставляем пустой массив для обратной совместимости
        createdAt: f.created_at,
      })) as SavedFavorite[];
    },
    enabled: !!user,
  });

  // Добавить в избранное (child_id/child_name сохраняются в recipe JSONB для отображения контекста в меню)
  const addFavorite = useMutation({
    mutationFn: async ({
      recipe,
      memberIds = [],
      childId,
      childName,
    }: {
      recipe: RecipeSuggestion;
      memberIds?: string[];
      childId?: string;
      childName?: string;
    }) => {
      if (!user) throw new Error('User not authenticated');

      const recipePayload = {
        ...recipe,
        ...(childId != null && { child_id: childId }),
        ...(childName != null && childName !== '' && { child_name: childName }),
      };

      const { data, error } = await supabase
        .from('favorites')
        .insert({
          user_id: user.id,
          recipe: recipePayload as any,
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
      const { error } = await supabase.from('favorites').delete().eq('id', id);

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
