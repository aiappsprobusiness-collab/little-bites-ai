import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeError } from "@/utils/safeLogger";
import { useAuth } from './useAuth';
import type { RecipeSuggestion } from '@/services/deepseek';

/** Рецепт в БД: в recipe_data JSONB сохраняются child_id/child_name (контекст при добавлении из чата, ключи в БД не меняем). */
export type StoredRecipe = RecipeSuggestion & {
  child_id?: string;
  child_name?: string;
  ingredientNames?: string[];
  ingredientTotalCount?: number;
};

export interface SavedFavorite {
  id: string;
  recipe: StoredRecipe;
  memberIds: string[];
  createdAt: string;
}

export function useFavorites() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // 1. favorites_v2 → recipe_ids; 2. get_recipe_previews(recipe_ids) → previews. Без полных recipes/recipe_ingredients.
  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ['favorites', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data: rows, error } = await supabase
        .from('favorites_v2')
        .select('id, recipe_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        safeError('DB Error in useFavorites (query):', error.message, 'Details:', error.details);
        throw error;
      }

      const list = (rows ?? []) as { id: string; recipe_id: string; created_at?: string }[];
      const recipeIds = list.map((r) => r.recipe_id).filter(Boolean);
      if (recipeIds.length === 0) {
        return list.map((f) => ({
          id: f.id,
          recipe: { id: f.recipe_id } as StoredRecipe,
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

      return list.map((f) => {
        const preview = previewMap.get(f.recipe_id);
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
            }
          : { id: f.recipe_id } as StoredRecipe;
        return {
          id: f.id,
          recipe,
          memberIds: [] as string[],
          createdAt: f.created_at ?? f.id,
          _recipeId: f.recipe_id,
        };
      }) as (SavedFavorite & { _recipeId?: string })[];
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
        safeError('DB Error in useFavorites addFavorite:', error.message, 'Details:', error.details);
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
        safeError('DB Error in useFavorites removeFavorite:', error.message, 'Details:', error.details);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
    },
  });

  const favoriteRecipeIds = new Set(
    favorites.flatMap((f) => {
      const id = (f as { _recipeId?: string })._recipeId ?? (f.recipe as { id?: string })?.id;
      return typeof id === 'string' && id.length > 0 ? [id] : [];
    })
  );

  return {
    favorites,
    favoriteRecipeIds,
    isLoading,
    addFavorite: addFavorite.mutateAsync,
    removeFavorite: removeFavorite.mutateAsync,
    isAdding: addFavorite.isPending,
    isRemoving: removeFavorite.isPending,
  };
}
