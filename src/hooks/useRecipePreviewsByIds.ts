import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { RecipePreview } from "@/types/recipePreview";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(s: string): boolean {
  return UUID_REGEX.test(s);
}

function toRecipePreview(row: {
  id: string;
  title: string | null;
  description: string | null;
  cooking_time_minutes: number | null;
  min_age_months: number | null;
  max_age_months: number | null;
  ingredient_names: string[] | null;
  ingredient_total_count: number | null;
  is_favorite?: boolean | null;
}): RecipePreview {
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
  };
}

/**
 * Fetches recipe previews by IDs. Filters to valid UUIDs only (starter recipe IDs like "s1-r1" are skipped).
 * Returns Record<recipeId, RecipePreview> + loading/error.
 */
export function useRecipePreviewsByIds(recipeIds: string[]) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ids = Array.from(new Set(recipeIds)).filter(isValidUUID);
  const stableIdsKey = [...ids].sort().join(",");

  const query = useQuery({
    queryKey: ["recipe_previews", user?.id, stableIdsKey],
    queryFn: async (): Promise<Record<string, RecipePreview>> => {
      if (!user || ids.length === 0) return {};
      const { data, error } = await supabase.rpc("get_recipe_previews", {
        recipe_ids: ids,
      });
      if (error) throw error;
      const rows = (data ?? []) as Array<{
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
      const map: Record<string, RecipePreview> = {};
      rows.forEach((r) => {
        map[r.id] = toRecipePreview(r);
      });
      return map;
    },
    enabled: !!user && ids.length > 0,
    staleTime: 60_000,
  });

  const invalidatePreviews = () => {
    queryClient.invalidateQueries({ queryKey: ["recipe_previews"] });
  };

  return {
    previews: query.data ?? {},
    isLoading: query.isLoading,
    error: query.error,
    invalidatePreviews,
  };
}
