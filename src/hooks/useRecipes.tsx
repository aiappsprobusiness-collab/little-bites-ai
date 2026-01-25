import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type Recipe = Tables<'recipes'>;
type RecipeInsert = TablesInsert<'recipes'>;
type RecipeUpdate = TablesUpdate<'recipes'>;
type RecipeIngredient = Tables<'recipe_ingredients'>;
type RecipeStep = Tables<'recipe_steps'>;

export function useRecipes(childId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Получить все рецепты пользователя.
  // Если указан childId (план питания для ребёнка): показываем общие (child_id = null) и рецепты этого ребёнка.
  const { data: recipes = [], isLoading, error } = useQuery({
    queryKey: ['recipes', user?.id, childId],
    queryFn: async () => {
      if (!user) return [];

      let query = supabase
        .from('recipes')
        .select('*')
        .eq('user_id', user.id);

      if (childId) {
        query = query.or(`child_id.is.null,child_id.eq.${childId}`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return data as Recipe[];
    },
    enabled: !!user,
  });

  // Получить избранные рецепты
  const { data: favoriteRecipes = [] } = useQuery({
    queryKey: ['recipes', user?.id, 'favorites'],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_favorite', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Recipe[];
    },
    enabled: !!user,
  });

  // Получить недавние рецепты
  const { data: recentRecipes = [] } = useQuery({
    queryKey: ['recipes', user?.id, 'recent'],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as Recipe[];
    },
    enabled: !!user,
  });

  // Получить один рецепт с ингредиентами и шагами
  const getRecipeById = (id: string) => {
    return useQuery({
      queryKey: ['recipes', id],
      queryFn: async () => {
        const { data: recipe, error: recipeError } = await supabase
          .from('recipes')
          .select('*')
          .eq('id', id)
          .single();

        if (recipeError) throw recipeError;

        const { data: ingredients, error: ingredientsError } = await supabase
          .from('recipe_ingredients')
          .select('*')
          .eq('recipe_id', id)
          .order('order_index', { ascending: true });

        if (ingredientsError) throw ingredientsError;

        const { data: steps, error: stepsError } = await supabase
          .from('recipe_steps')
          .select('*')
          .eq('recipe_id', id)
          .order('step_number', { ascending: true });

        if (stepsError) throw stepsError;

        return {
          ...recipe,
          ingredients: ingredients || [],
          steps: steps || [],
        } as Recipe & { ingredients: RecipeIngredient[]; steps: RecipeStep[] };
      },
      enabled: !!id,
    });
  };

  // Создать рецепт
  const createRecipe = useMutation({
    mutationFn: async ({
      recipe,
      ingredients = [],
      steps = [],
    }: {
      recipe: Omit<RecipeInsert, 'user_id'>;
      ingredients?: Omit<RecipeIngredient, 'id' | 'recipe_id'>[];
      steps?: Omit<RecipeStep, 'id' | 'recipe_id'>[];
    }) => {
      if (!user) throw new Error('User not authenticated');

      // Создаем рецепт
      const { data: newRecipe, error: recipeError } = await supabase
        .from('recipes')
        .insert({
          ...recipe,
          user_id: user.id,
        })
        .select()
        .single();

      if (recipeError) throw recipeError;

      // Создаем ингредиенты
      if (ingredients.length > 0) {
        const { error: ingredientsError } = await supabase
          .from('recipe_ingredients')
          .insert(
            ingredients.map((ing, index) => ({
              ...ing,
              recipe_id: newRecipe.id,
              order_index: ing.order_index ?? index,
            }))
          );

        if (ingredientsError) throw ingredientsError;
      }

      // Создаем шаги
      if (steps.length > 0) {
        const { error: stepsError } = await supabase
          .from('recipe_steps')
          .insert(
            steps.map((step) => ({
              ...step,
              recipe_id: newRecipe.id,
            }))
          );

        if (stepsError) throw stepsError;
      }

      return newRecipe as Recipe;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', user?.id] });
    },
  });

  // Обновить рецепт
  const updateRecipe = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & RecipeUpdate) => {
      const { data, error } = await supabase
        .from('recipes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Recipe;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', user?.id] });
    },
  });

  // Удалить рецепт
  const deleteRecipe = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('recipes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', user?.id] });
    },
  });

  // Переключить избранное
  const toggleFavorite = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      const { data, error } = await supabase
        .from('recipes')
        .update({ is_favorite: isFavorite })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Recipe;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', user?.id] });
    },
  });

  return {
    recipes,
    favoriteRecipes,
    recentRecipes,
    isLoading,
    error,
    getRecipeById,
    createRecipe: createRecipe.mutateAsync,
    updateRecipe: updateRecipe.mutateAsync,
    deleteRecipe: deleteRecipe.mutateAsync,
    toggleFavorite: toggleFavorite.mutateAsync,
    isCreating: createRecipe.isPending,
    isUpdating: updateRecipe.isPending,
    isDeleting: deleteRecipe.isPending,
  };
}
