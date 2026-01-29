import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import {
  RECIPES_LIST_SELECT,
  RECIPES_DETAIL_SELECT,
  RECIPES_PAGE_SIZE,
} from '@/lib/supabase-constants';
import { getCachedRecipe, setCachedRecipe, invalidateRecipeCache } from '@/utils/recipeCache';
import mockRecipes from '@/mocks/mockRecipes.json';

type Recipe = Tables<'recipes'>;
type RecipeInsert = TablesInsert<'recipes'>;
type RecipeUpdate = TablesUpdate<'recipes'>;
type RecipeIngredient = Tables<'recipe_ingredients'>;
type RecipeStep = Tables<'recipe_steps'>;

const IS_DEV = import.meta.env.DEV;

export function useRecipes(childId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const listQuery = (page: number) => {
    if (IS_DEV) {
      const start = page * RECIPES_PAGE_SIZE;
      return Promise.resolve((mockRecipes as unknown[]).slice(start, start + RECIPES_PAGE_SIZE) as Recipe[]);
    }
    let q = supabase
      .from('recipes')
      .select(RECIPES_LIST_SELECT)
      .eq('user_id', user!.id);
    if (childId) q = q.or(`child_id.is.null,child_id.eq.${childId}`);
    return q
      .order('created_at', { ascending: false })
      .range(page * RECIPES_PAGE_SIZE, (page + 1) * RECIPES_PAGE_SIZE - 1)
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as Recipe[];
      });
  };

  const { data: recipes = [], isLoading, error } = useQuery({
    queryKey: ['recipes', user?.id, childId, 0],
    queryFn: () => listQuery(0),
    enabled: !!user,
  });

  const { data: favoriteRecipes = [] } = useQuery({
    queryKey: ['recipes', user?.id, 'favorites'],
    queryFn: async () => {
      if (!user) return [];
      if (IS_DEV) return (mockRecipes as unknown[]).filter((r: { is_favorite?: boolean }) => r.is_favorite) as Recipe[];
      const { data, error } = await supabase
        .from('recipes')
        .select(RECIPES_LIST_SELECT)
        .eq('user_id', user.id)
        .eq('is_favorite', true)
        .order('created_at', { ascending: false })
        .limit(RECIPES_PAGE_SIZE);
      if (error) throw error;
      return (data ?? []) as Recipe[];
    },
    enabled: !!user,
  });

  const { data: recentRecipes = [] } = useQuery({
    queryKey: ['recipes', user?.id, 'recent'],
    queryFn: async () => {
      if (!user) return [];
      if (IS_DEV) return (mockRecipes as unknown[]).slice(0, RECIPES_PAGE_SIZE) as Recipe[];
      const { data, error } = await supabase
        .from('recipes')
        .select(RECIPES_LIST_SELECT)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(RECIPES_PAGE_SIZE);
      if (error) throw error;
      return (data ?? []) as Recipe[];
    },
    enabled: !!user,
  });

  const getRecipeById = (id: string) => {
    return useQuery({
      queryKey: ['recipes', id],
      queryFn: async () => {
        const ttl = 3600000;
        const cached = getCachedRecipe<Recipe & { ingredients: RecipeIngredient[]; steps: RecipeStep[] }>(id, ttl);
        if (cached) return cached;

        if (IS_DEV) {
          const mock = (mockRecipes as unknown[]).find((r: { id: string }) => r.id === id);
          if (mock) return mock as Recipe & { ingredients: RecipeIngredient[]; steps: RecipeStep[] };
        }

        const { data: recipe, error: recipeError } = await supabase
          .from('recipes')
          .select(RECIPES_DETAIL_SELECT)
          .eq('id', id)
          .single();

        if (recipeError) throw recipeError;

        const r = recipe as { recipe_ingredients?: unknown[]; ingredients?: unknown[]; recipe_steps?: unknown[]; steps?: unknown[] };
        const ingredients = Array.isArray(r.ingredients) ? r.ingredients : Array.isArray(r.recipe_ingredients) ? r.recipe_ingredients : [];
        const steps = Array.isArray(r.steps) ? r.steps : Array.isArray(r.recipe_steps) ? r.recipe_steps : [];
        const { recipe_ingredients: _ri, recipe_steps: _rs, ingredients: _i, steps: _s, ...rest } = r;
        const out = { ...rest, ingredients, steps } as Recipe & { ingredients: RecipeIngredient[]; steps: RecipeStep[] };
        setCachedRecipe(id, out);
        return out;
      },
      enabled: !!id,
    });
  };

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

      const { data: newRecipe, error: recipeError } = await supabase
        .from('recipes')
        .insert({ ...recipe, user_id: user.id })
        .select()
        .single();

      if (recipeError) throw recipeError;

      if (ingredients.length > 0) {
        const { error: ingredientsError } = await supabase
          .from('recipe_ingredients')
          .insert(ingredients.map((ing, index) => ({ ...ing, recipe_id: newRecipe.id, order_index: ing.order_index ?? index })));
        if (ingredientsError) throw ingredientsError;
      }

      if (steps.length > 0) {
        const { error: stepsError } = await supabase
          .from('recipe_steps')
          .insert(steps.map((step) => ({ ...step, recipe_id: newRecipe.id })));
        if (stepsError) throw stepsError;
      }

      return newRecipe as Recipe;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', user?.id] });
    },
  });

  const updateRecipe = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & RecipeUpdate) => {
      const { data, error } = await supabase
        .from('recipes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      invalidateRecipeCache(id);
      return data as Recipe;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', user?.id] });
    },
  });

  const deleteRecipe = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recipes').delete().eq('id', id);
      if (error) throw error;
      invalidateRecipeCache(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', user?.id] });
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      const { data, error } = await supabase
        .from('recipes')
        .update({ is_favorite: isFavorite })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      invalidateRecipeCache(id);
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
