import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { RecipeSuggestion } from '@/services/deepseek';

export interface SavedFavorite {
  id: string;
  recipe: RecipeSuggestion;
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

      if (error) throw error;

      return (data || []).map((f) => ({
        id: f.id,
        recipe: f.recipe as RecipeSuggestion,
        memberIds: [], // Убрано из схемы, оставляем пустой массив для обратной совместимости
        createdAt: f.created_at,
      })) as SavedFavorite[];
    },
    enabled: !!user,
  });

  // Добавить в избранное
  const addFavorite = useMutation({
    mutationFn: async ({
      recipe,
      memberIds = [],
    }: {
      recipe: RecipeSuggestion;
      memberIds?: string[];
    }) => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('favorites')
        .insert({
          user_id: user.id,
          recipe: recipe as any,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
    },
  });

  // Удалить из избранного
  const removeFavorite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('favorites').delete().eq('id', id);

      if (error) throw error;
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
