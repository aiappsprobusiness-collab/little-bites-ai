import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { RecipePreview } from "@/types/recipePreview";

export interface MyRecipePreview extends RecipePreview {
  source?: string | null;
}

function toPreview(row: {
  id: string;
  title: string | null;
  description: string | null;
  cooking_time_minutes: number | null;
  min_age_months: number | null;
  max_age_months: number | null;
  ingredient_names: string[] | null;
  ingredient_total_count: number | null;
  is_favorite?: boolean | null;
}, source?: string | null): MyRecipePreview {
  return {
    id: row.id,
    title: row.title ?? "",
    description: row.description ?? null,
    cookTimeMinutes: row.cooking_time_minutes ?? null,
    ingredientNames: Array.isArray(row.ingredient_names) ? row.ingredient_names : [],
    ingredientTotalCount: typeof row.ingredient_total_count === "number" ? row.ingredient_total_count : 0,
    minAgeMonths: row.min_age_months ?? null,
    maxAgeMonths: row.max_age_months ?? null,
    isFavorite: !!row.is_favorite,
    source: source ?? null,
  };
}

export function useMyRecipes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: list = [], isLoading } = useQuery({
    queryKey: ["my_recipes", user?.id],
    queryFn: async (): Promise<MyRecipePreview[]> => {
      if (!user) return [];
      const { data: recipeRows, error } = await supabase
        .from("recipes")
        .select("id")
        .eq("owner_user_id", user.id)
        .eq("source", "user_custom")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (recipeRows ?? []).map((r) => r.id).filter(Boolean);
      if (ids.length === 0) return [];
      const [previewsRes, metaRes] = await Promise.all([
        supabase.rpc("get_recipe_previews", { recipe_ids: ids }),
        supabase.from("recipes").select("id, chef_advice, advice, source, calories, proteins, fats, carbs").in("id", ids),
      ]);
      if (previewsRes.error) throw previewsRes.error;
      const metaMap = new Map(
        ((metaRes.data ?? []) as {
          id: string;
          chef_advice?: string | null;
          advice?: string | null;
          source?: string | null;
          calories?: number | null;
          proteins?: number | null;
          fats?: number | null;
          carbs?: number | null;
        }[]).map((r) => [
          r.id,
          {
            chefAdvice: r.chef_advice ?? null,
            advice: r.advice ?? null,
            source: r.source ?? null,
            calories: r.calories ?? null,
            proteins: r.proteins ?? null,
            fats: r.fats ?? null,
            carbs: r.carbs ?? null,
          },
        ])
      );
      const rows = (previewsRes.data ?? []) as Array<{
        id: string;
        title: string | null;
        description: string | null;
        cooking_time_minutes: number | null;
        min_age_months: number | null;
        max_age_months: number | null;
        ingredient_names: string[] | null;
        ingredient_total_count: number | null;
        is_favorite?: boolean | null;
      }>;
      return rows.map((r) => {
        const preview = toPreview(r);
        const meta = metaMap.get(r.id);
        if (meta) {
          preview.chefAdvice = meta.chefAdvice;
          preview.advice = meta.advice;
          preview.source = meta.source;
          preview.calories = meta.calories ?? undefined;
          preview.proteins = meta.proteins ?? undefined;
          preview.fats = meta.fats ?? undefined;
          preview.carbs = meta.carbs ?? undefined;
        }
        return preview;
      });
    },
    enabled: !!user,
  });

  const createUserRecipe = useMutation({
    mutationFn: async (params: {
      title: string;
      description?: string | null;
      meal_type?: string | null;
      tags?: string[] | null;
      chef_advice?: string | null;
      steps: { instruction: string; step_number?: number }[];
      ingredients: {
        name: string;
        amount?: number | null;
        unit?: string | null;
        display_text?: string | null;
        canonical_amount?: number | null;
        canonical_unit?: string | null;
        category?: string | null;
        order_index?: number;
      }[];
    }) => {
      if (!user) throw new Error("User not authenticated");
      const stepsPayload = params.steps.map((s, i) => ({
        instruction: s.instruction ?? "",
        step_number: s.step_number ?? i + 1,
      }));
      const ingredientsPayload = params.ingredients.map((ing, idx) => {
        const display_text =
          ing.display_text ??
          (ing.amount != null && ing.unit
            ? `${ing.name} — ${ing.amount} ${ing.unit}`
            : ing.amount != null
              ? `${ing.name} — ${ing.amount}`
              : ing.name);
        return {
          name: ing.name,
          amount: ing.amount ?? null,
          unit: ing.unit ?? null,
          display_text,
          canonical_amount: ing.canonical_amount ?? null,
          canonical_unit: ing.canonical_unit ?? null,
          category: ing.category ?? "other",
          order_index: ing.order_index ?? idx,
        };
      });
      const { data, error } = await supabase.rpc("create_user_recipe", {
        p_title: params.title.trim(),
        p_description: params.description?.trim() ?? null,
        p_meal_type: params.meal_type?.trim() ?? null,
        p_tags: params.tags ?? [],
        p_chef_advice: params.chef_advice?.trim() || null,
        p_steps: stepsPayload,
        p_ingredients: ingredientsPayload,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my_recipes", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["recipe_previews"] });
    },
  });

  const updateUserRecipe = useMutation({
    mutationFn: async (params: {
      recipe_id: string;
      title: string;
      description?: string | null;
      meal_type?: string | null;
      tags?: string[] | null;
      chef_advice?: string | null;
      steps: { instruction: string; step_number?: number }[];
      ingredients: {
        name: string;
        amount?: number | null;
        unit?: string | null;
        display_text?: string | null;
        canonical_amount?: number | null;
        canonical_unit?: string | null;
        category?: string | null;
        order_index?: number;
      }[];
    }) => {
      if (!user) throw new Error("User not authenticated");
      const stepsPayload = params.steps.map((s, i) => ({
        instruction: s.instruction ?? "",
        step_number: s.step_number ?? i + 1,
      }));
      const ingredientsPayload = params.ingredients.map((ing, idx) => {
        const display_text =
          ing.display_text ??
          (ing.amount != null && ing.unit
            ? `${ing.name} — ${ing.amount} ${ing.unit}`
            : ing.amount != null
              ? `${ing.name} — ${ing.amount}`
              : ing.name);
        return {
          name: ing.name,
          amount: ing.amount ?? null,
          unit: ing.unit ?? null,
          display_text,
          canonical_amount: ing.canonical_amount ?? null,
          canonical_unit: ing.canonical_unit ?? null,
          category: ing.category ?? "other",
          order_index: ing.order_index ?? idx,
        };
      });
      const { error } = await supabase.rpc("update_user_recipe", {
        p_recipe_id: params.recipe_id,
        p_title: params.title.trim(),
        p_description: params.description?.trim() ?? null,
        p_meal_type: params.meal_type?.trim() ?? null,
        p_tags: params.tags ?? [],
        p_chef_advice: params.chef_advice?.trim() || null,
        p_steps: stepsPayload,
        p_ingredients: ingredientsPayload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my_recipes", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["recipe_previews"] });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const deleteUserRecipe = useMutation({
    mutationFn: async (recipeId: string) => {
      if (!user) throw new Error("User not authenticated");
      const { error } = await supabase.rpc("delete_user_recipe", { p_recipe_id: recipeId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my_recipes", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["recipe_previews"] });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  return {
    myRecipes: list,
    isLoading,
    createUserRecipe: createUserRecipe.mutateAsync,
    updateUserRecipe: updateUserRecipe.mutateAsync,
    deleteUserRecipe: deleteUserRecipe.mutateAsync,
    isCreating: createUserRecipe.isPending,
    isUpdating: updateUserRecipe.isPending,
    isDeleting: deleteUserRecipe.isPending,
  };
}
