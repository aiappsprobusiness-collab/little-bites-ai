import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { RecipePreview } from "@/types/recipePreview";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEBOUNCE_MS = 80;

function isValidUUID(s: string): boolean {
  return UUID_REGEX.test(s);
}

function stableIdsKey(recipeIds: string[]): string {
  return [...new Set(recipeIds)].filter(isValidUUID).sort().join(",");
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
 * Fetches recipe previews by IDs. Filters to valid UUIDs only (non-UUIDs are skipped).
 * IDs are stabilized (unique + sort) and debounced (80ms) so rapid changes during generation don't trigger many requests.
 */
export function useRecipePreviewsByIds(recipeIds: string[]) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputKey = useMemo(() => stableIdsKey(recipeIds), [recipeIds]);
  const [debouncedKey, setDebouncedKey] = useState(inputKey);

  useEffect(() => {
    if (inputKey === debouncedKey) return;
    if (!debouncedKey && inputKey) {
      setDebouncedKey(inputKey);
      return;
    }
    const t = setTimeout(() => setDebouncedKey(inputKey), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [inputKey, debouncedKey]);

  const ids = useMemo(() => (debouncedKey ? debouncedKey.split(",").filter(Boolean) : []), [debouncedKey]);

  const query = useQuery({
    queryKey: ["recipe_previews", user?.id, debouncedKey],
    queryFn: async (): Promise<Record<string, RecipePreview>> => {
      if (!user || ids.length === 0) return {};
      const [previewsResult, tipsResult] = await Promise.all([
        supabase.rpc("get_recipe_previews", { recipe_ids: ids }),
        supabase.from("recipes").select("id, chef_advice, advice, source").in("id", ids),
      ]);
      const { data: previewRows, error } = previewsResult;
      if (error) throw error;
      const tipsRows = (tipsResult.data ?? []) as Array<{ id: string; chef_advice?: string | null; advice?: string | null; source?: string | null }>;
      const tipsMap = new Map(tipsRows.map((r) => [r.id, { chefAdvice: r.chef_advice ?? null, advice: r.advice ?? null, source: r.source ?? null }]));
      const rows = (previewRows ?? []) as Array<{
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
        const preview = toRecipePreview(r);
        const tips = tipsMap.get(r.id);
        if (tips) {
          preview.chefAdvice = tips.chefAdvice;
          preview.advice = tips.advice;
          preview.source = tips.source;
        }
        map[r.id] = preview;
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
