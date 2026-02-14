import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { safeWarn } from "@/utils/safeLogger";
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import {
  RECIPES_LIST_SELECT,
  RECIPES_DETAIL_SELECT,
  RECIPES_PAGE_SIZE,
} from '@/lib/supabase-constants';
import { getCachedRecipe, setCachedRecipe, invalidateRecipeCache } from '@/utils/recipeCache';
import { ensureStringArray } from '@/utils/typeUtils';
import mockRecipes from '@/mocks/mockRecipes.json';

type Recipe = Tables<'recipes'>;
type RecipeInsert = TablesInsert<'recipes'>;
type RecipeUpdate = TablesUpdate<'recipes'>;
type RecipeIngredient = Tables<'recipe_ingredients'>;
type RecipeStep = Tables<'recipe_steps'>;

const IS_DEV = import.meta.env.DEV;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && UUID_REGEX.test(value);
}

/** Привести к integer (схема recipes: calories, cooking_time_minutes, min_age_months и т.д.). */
function ensureInteger(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

/** Привести к numeric (proteins, fats, carbs). */
function ensureNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Нормализовать payload рецепта под схему: integer, text[], numeric, UUID. */
function normalizeRecipePayload<T extends Record<string, unknown>>(payload: T): T {
  const out = { ...payload };
  const intKeys = ['calories', 'cooking_time_minutes', 'min_age_months', 'max_age_months', 'times_cooked', 'rating'] as const;
  for (const key of intKeys) {
    if (key in out && out[key] !== undefined) {
      (out as Record<string, unknown>)[key] = ensureInteger(out[key]);
    }
  }
  const numKeys = ['proteins', 'fats', 'carbs'] as const;
  for (const key of numKeys) {
    if (key in out && out[key] !== undefined) {
      (out as Record<string, unknown>)[key] = ensureNumber(out[key]);
    }
  }
  if ('tags' in out && out.tags !== undefined) {
    (out as Record<string, unknown>).tags = ensureStringArray(out.tags);
  }
  if ('source_products' in out && out.source_products !== undefined) {
    (out as Record<string, unknown>).source_products = ensureStringArray(out.source_products);
  }
  if ('child_id' in out) {
    const cid = out.child_id;
    (out as Record<string, unknown>).child_id = cid != null && isValidUUID(cid) ? cid : null;
  }
  if ('member_id' in out) {
    const mid = out.member_id;
    (out as Record<string, unknown>).member_id = mid != null && isValidUUID(mid) ? mid : null;
  }
  if (!('member_id' in out) || (out as Record<string, unknown>).member_id === undefined) {
    const cid = (out as Record<string, unknown>).child_id;
    if (cid != null && isValidUUID(cid)) (out as Record<string, unknown>).member_id = cid;
  }
  if (!('child_id' in out) || (out as Record<string, unknown>).child_id === undefined) {
    const mid = (out as Record<string, unknown>).member_id;
    if (mid != null && isValidUUID(mid)) (out as Record<string, unknown>).child_id = mid;
  }
  if ('user_id' in out && out.user_id !== undefined && !isValidUUID(out.user_id)) {
    safeWarn('recipes: user_id is not a valid UUID', out.user_id);
  }
  if ('macros' in out && out.macros !== undefined && out.macros !== null) {
    const m = out.macros;
    if (typeof m !== 'object' || Array.isArray(m)) {
      (out as Record<string, unknown>).macros = null;
    }
  }
  return out;
}

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
    if (childId) q = q.or(`member_id.is.null,member_id.eq.${childId}`);
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
      const { data: favs, error: favError } = await supabase
        .from('favorites_v2')
        .select('recipe_id')
        .eq('user_id', user.id)
        .not('recipe_id', 'is', null);
      if (favError) throw favError;
      const ids = (favs ?? []).map((f) => f.recipe_id).filter(isValidUUID) as string[];
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('recipes')
        .select(RECIPES_LIST_SELECT)
        .eq('user_id', user.id)
        .in('id', ids)
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
      if (!isValidUUID(user.id)) throw new Error('Invalid user_id');

      const payload = normalizeRecipePayload({
        ...recipe,
        user_id: user.id,
      } as Record<string, unknown>) as RecipeInsert;

      const { data: newRecipe, error: recipeError } = await supabase
        .from('recipes')
        .insert(payload)
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
      if (!id || !isValidUUID(id)) throw new Error('Recipe id must be a valid UUID');

      const payload = normalizeRecipePayload(updates as Record<string, unknown>) as RecipeUpdate;

      const { data, error } = await supabase
        .from('recipes')
        .update(payload)
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
    mutationFn: async ({ id, isFavorite, preview }: { id: string; isFavorite: boolean; preview?: { title?: string; description?: string | null; cookTimeMinutes?: number | null; ingredientNames?: string[]; chefAdvice?: string | null; advice?: string | null } }) => {
      if (!user) throw new Error('User not authenticated');
      if (isFavorite) {
        const { data: existing } = await supabase
          .from('favorites_v2')
          .select('id')
          .eq('user_id', user.id)
          .eq('recipe_id', id)
          .maybeSingle();
        if (existing) return { id } as Recipe;
        const recipe_data = preview
          ? {
              id,
              title: preview.title ?? '',
              description: preview.description ?? null,
              cookingTime: preview.cookTimeMinutes ?? null,
              ingredients: (preview.ingredientNames ?? []).map((n) => ({ name: n })),
              ...(preview.chefAdvice != null && preview.chefAdvice !== '' && { chefAdvice: preview.chefAdvice }),
              ...(preview.advice != null && preview.advice !== '' && { advice: preview.advice }),
            }
          : { id };
        const { error } = await supabase.from('favorites_v2').insert({ user_id: user.id, recipe_id: id, recipe_data });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('favorites_v2').delete().eq('user_id', user.id).eq('recipe_id', id);
        if (error) throw error;
      }
      invalidateRecipeCache(id);
      return { id } as Recipe;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
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
