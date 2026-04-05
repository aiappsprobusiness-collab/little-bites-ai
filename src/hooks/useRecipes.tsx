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
import { invalidateRecipeCache } from '@/utils/recipeCache';
import { ensureStringArray } from '@/utils/typeUtils';
import { canonicalizeRecipePayload } from '@/utils/recipeCanonical';
import { getAppLocale } from '@/utils/appLocale';
import { requestRecipeTranslation } from '@/utils/requestRecipeTranslation';
import {
  buildRecipeBenefitDescription,
  resolveBenefitDescriptionSeed,
} from '@/utils/recipeBenefitDescription';
import { inferNutritionGoals } from '@/utils/inferNutritionGoals';
import mockRecipes from '@/mocks/mockRecipes.json';
import { TAB_NAV_STALE_MS } from '@/utils/reactQueryTabNav';

type Recipe = Tables<'recipes'>;
type RecipeInsert = TablesInsert<'recipes'>;
type RecipeUpdate = TablesUpdate<'recipes'>;
type RecipeIngredient = Tables<'recipe_ingredients'>;
type RecipeStep = Tables<'recipe_steps'>;

const IS_DEV = import.meta.env.DEV;

/** Опции загрузки списков: мутации (`createRecipe` и т.д.) работают независимо. */
export type UseRecipesOptions = {
  /**
   * Когда false — не поднимаем useQuery для списка / избранного / недавних (только мутации + getRecipeById).
   * Этап 1 оптимизации: replace flow на плане без лишнего трафика до действия пользователя.
   */
  listQueriesEnabled?: boolean;
};

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
  if ('nutrition_goals' in out && out.nutrition_goals !== undefined) {
    (out as Record<string, unknown>).nutrition_goals = ensureStringArray(out.nutrition_goals);
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

export function useRecipes(childId?: string, options?: UseRecipesOptions) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const listQueriesEnabled = options?.listQueriesEnabled !== false;

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
    enabled: !!user && listQueriesEnabled,
    staleTime: TAB_NAV_STALE_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
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
    enabled: !!user && listQueriesEnabled,
    staleTime: TAB_NAV_STALE_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
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
    enabled: !!user && listQueriesEnabled,
    staleTime: TAB_NAV_STALE_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const getRecipeById = (id: string) => {
    const locale = getAppLocale();
    return useQuery({
      queryKey: ['recipes', id, locale],
      queryFn: async () => {
        if (IS_DEV) {
          const mock = (mockRecipes as unknown[]).find((r: { id: string }) => r.id === id);
          if (mock) return mock as Recipe & { ingredients: RecipeIngredient[]; steps: RecipeStep[] };
        }

        const [fullRes, servingsRes] = await Promise.all([
          supabase.rpc('get_recipe_full', { p_recipe_id: id, p_locale: locale }),
          supabase.from('recipes').select('servings_base, servings_recommended').eq('id', id).single(),
        ]);

        if (fullRes.error) throw fullRes.error;
        const row = Array.isArray(fullRes.data) ? fullRes.data[0] : fullRes.data;
        if (!row) throw new Error('Recipe not found');

        const r = row as Record<string, unknown>;
        const stepsJson = r.steps_json as { instruction?: string; step_number?: number }[] | null | undefined;
        const rawSteps = Array.isArray(stepsJson) ? stepsJson : [];
        const steps = [...rawSteps].sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
        const ingJson = r.ingredients_json as {
          name?: string;
          amount?: number | null;
          unit?: string | null;
          substitute?: string | null;
          display_text?: string | null;
          canonical_amount?: number | null;
          canonical_unit?: string | null;
          category?: string | null;
          display_amount?: number | null;
          display_unit?: string | null;
          display_quantity_text?: string | null;
          measurement_mode?: string | null;
        }[] | null | undefined;
        const ingRows = Array.isArray(ingJson) ? ingJson : [];
        const ingredients = ingRows.map((ing) => ({
          name: ing.name ?? '',
          amount: ing.amount ?? null,
          unit: ing.unit ?? null,
          substitute: ing.substitute ?? null,
          display_text: ing.display_text ?? null,
          canonical_amount: ing.canonical_amount ?? null,
          canonical_unit: ing.canonical_unit ?? null,
          category: ing.category ?? null,
          display_amount: ing.display_amount ?? null,
          display_unit: ing.display_unit ?? null,
          display_quantity_text: ing.display_quantity_text ?? null,
          measurement_mode: ing.measurement_mode ?? 'canonical_only',
        })) as RecipeIngredient[];

        const servingsRow = servingsRes.data as { servings_base?: number | null; servings_recommended?: number | null } | null;
        const { steps_json: _sj, ingredients_json: _ij, ...rest } = r;
        const out = {
          ...rest,
          nutrition_goals: ensureStringArray(r.nutrition_goals),
          servings_base: servingsRow?.servings_base ?? 1,
          servings_recommended: servingsRow?.servings_recommended ?? 4,
          ingredients,
          steps,
        } as Recipe & { ingredients: RecipeIngredient[]; steps: RecipeStep[] };
        return out;
      },
      enabled: !!id,
      staleTime: TAB_NAV_STALE_MS,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    });
  };

  const MIN_STEPS = 3;
  const MIN_INGREDIENTS = 3;

  const createRecipe = useMutation({
    mutationFn: async ({
      recipe,
      ingredients = [],
      steps = [],
      source = 'chat_ai',
      canonicalBenefitPersist,
    }: {
      recipe: Omit<RecipeInsert, 'user_id'>;
      ingredients?: Omit<RecipeIngredient, 'id' | 'recipe_id'>[];
      steps?: Omit<RecipeStep, 'id' | 'recipe_id'>[];
      source?: 'week_ai' | 'chat_ai' | 'starter' | 'seed' | 'manual';
      /**
       * Для week_ai/starter/seed: после RPC подставляется buildRecipeBenefitDescription.
       * Для chat_ai: description берётся из переданного recipe (как с Edge — LLM-first или fallback), без перезаписи benefit-builder.
       * Не используется для source === 'manual' (свободный текст из формы).
       */
      canonicalBenefitPersist?: {
        /** Как у ChatRecipeCard до появления recipe.id */
        chatMessageId?: string | null;
        nutritionGoals?: string[] | null;
      };
    }) => {
      if (!user) throw new Error('User not authenticated');
      if (!isValidUUID(user.id)) throw new Error('Invalid user_id');

      const normalized = normalizeRecipePayload({
        ...recipe,
        user_id: user.id,
      } as Record<string, unknown>) as Record<string, unknown>;

      const stepsPadded =
        source === 'week_ai'
          ? steps
          : steps.length >= MIN_STEPS
            ? steps
            : [...steps, ...Array.from({ length: MIN_STEPS - steps.length }, (_, i) => ({ instruction: `Шаг ${steps.length + i + 1}`, step_number: steps.length + i + 1 }))];
      const ingredientsPadded =
        ingredients.length >= MIN_INGREDIENTS
          ? ingredients
          : [...ingredients, ...Array.from({ length: MIN_INGREDIENTS - ingredients.length }, (_, i) => ({ name: `Ингредиент ${ingredients.length + i + 1}`, order_index: ingredients.length + i }))];

      const titleStr = (normalized.title as string) ?? 'Рецепт';

      let nutritionGoalsForBenefit: string[] = [];
      if (source !== 'manual') {
        if (canonicalBenefitPersist?.nutritionGoals != null && canonicalBenefitPersist.nutritionGoals.length > 0) {
          nutritionGoalsForBenefit = canonicalBenefitPersist.nutritionGoals;
        } else if (Array.isArray((normalized as Record<string, unknown>).nutrition_goals) && ((normalized as Record<string, unknown>).nutrition_goals as unknown[]).length > 0) {
          nutritionGoalsForBenefit = ((normalized as Record<string, unknown>).nutrition_goals as unknown[]).filter((g): g is string => typeof g === 'string');
        } else {
          nutritionGoalsForBenefit = inferNutritionGoals({
            title: titleStr,
            description: String((normalized as Record<string, unknown>).description ?? ''),
            ingredients: ingredientsPadded.map((ing) => ({
              name: ing.name,
              display_text: (ing as Record<string, unknown>).display_text ?? null,
            })),
            steps: stepsPadded.map((s) => s.instruction ?? ''),
          });
        }
        (normalized as Record<string, unknown>).nutrition_goals = nutritionGoalsForBenefit;
      }

      if (source !== 'manual' && source !== 'chat_ai') {
        const seed = resolveBenefitDescriptionSeed({
          recipeId: null,
          chatMessageId: canonicalBenefitPersist?.chatMessageId ?? null,
          title: titleStr,
        });
        const preDesc = buildRecipeBenefitDescription({
          recipeId: seed.recipeId,
          stableKey: seed.stableKey ?? null,
          goals: nutritionGoalsForBenefit,
          title: titleStr,
        });
        (normalized as Record<string, unknown>).description = preDesc;
      }

      const rpcPayload = canonicalizeRecipePayload({
        user_id: user.id,
        member_id: (normalized as Record<string, unknown>).member_id ?? null,
        child_id: (normalized as Record<string, unknown>).child_id ?? null,
        source,
        mealType: (normalized as Record<string, unknown>).meal_type ?? null,
        tags: (normalized as Record<string, unknown>).tags ?? null,
        title: titleStr,
        description: (normalized.description as string) ?? null,
        cooking_time_minutes: (normalized as Record<string, unknown>).cooking_time_minutes ?? null,
        chef_advice: (normalized as Record<string, unknown>).chef_advice ?? null,
        advice: (normalized as Record<string, unknown>).advice ?? null,
        steps: stepsPadded.map((s, i) => ({ instruction: s.instruction ?? '', step_number: s.step_number ?? i + 1 })),
        ingredients: ingredientsPadded.map((ing, i) => ({
          name: ing.name,
          amount: ing.amount ?? null,
          unit: (ing as Record<string, unknown>).unit ?? null,
          display_text: (ing as Record<string, unknown>).display_text ?? null,
          substitute: (ing as Record<string, unknown>).substitute ?? null,
          canonical_amount: (ing as Record<string, unknown>).canonical_amount ?? null,
          canonical_unit: (ing as Record<string, unknown>).canonical_unit ?? null,
          order_index: ing.order_index ?? i,
          category: (ing as Record<string, unknown>).category ?? 'other',
        })),
        sourceTag: source === 'week_ai' ? 'week_ai' : 'chat',
        nutrition_goals: Array.isArray((normalized as Record<string, unknown>).nutrition_goals)
          ? ((normalized as Record<string, unknown>).nutrition_goals as unknown[]).filter((g): g is string => typeof g === 'string')
          : [],
      });

      console.log('FINAL_INGREDIENTS_PAYLOAD', rpcPayload.ingredients);

      const { data: recipeId, error: rpcError } = await supabase.rpc('create_recipe_with_steps', { payload: rpcPayload });
      if (rpcError) throw rpcError;
      if (!recipeId) throw new Error('create_recipe_with_steps returned no id');

      if (source !== 'manual' && source !== 'chat_ai') {
        const postDesc = buildRecipeBenefitDescription({
          recipeId,
          goals: nutritionGoalsForBenefit,
          title: titleStr,
        });
        const { error: benefitDescErr } = await supabase.from('recipes').update({ description: postDesc }).eq('id', recipeId);
        if (benefitDescErr) safeWarn('recipes: canonical benefit description update failed', benefitDescErr);
        (normalized as Record<string, unknown>).description = postDesc;
      }

      return { id: recipeId, ...normalized, title: normalized.title ?? '' } as Recipe;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recipes', user?.id] });
      if (data?.id) requestRecipeTranslation(data.id);
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recipes', user?.id] });
      if (data?.id) queryClient.invalidateQueries({ queryKey: ['recipes', data.id] });
    },
  });

  const deleteRecipe = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recipes').delete().eq('id', id);
      if (error) throw error;
      invalidateRecipeCache(id);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['recipes', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['recipes', id] });
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
      queryClient.invalidateQueries({ queryKey: ['recipe_previews'] });
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
