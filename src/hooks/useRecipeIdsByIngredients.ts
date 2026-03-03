import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type IngredientFilterScope = "favorites" | "my_recipes";
export type IngredientFilterMode = "include" | "exclude";

const STALE_MS = 3 * 60 * 1000;

function recipeIdsByIngredientsKey(
  userId: string | undefined,
  terms: string[],
  scope: IngredientFilterScope,
  memberId: string | null,
  mode: IngredientFilterMode
): unknown[] {
  return ["recipe_ids_by_ingredients", userId, terms.slice().sort(), scope, memberId ?? "family", mode];
}

/**
 * RPC: get_recipe_ids_by_ingredients(ingredient_terms, mode, scope, member_id).
 * Returns Set of recipe_id for client-side filtering of Favorites / My Recipes lists.
 * When terms are empty, returns undefined (no filter applied).
 */
export function useRecipeIdsByIngredients(
  ingredientTerms: string[],
  scope: IngredientFilterScope,
  options: {
    memberId?: string | null;
    mode?: IngredientFilterMode;
    enabled?: boolean;
  } = {}
) {
  const { user } = useAuth();
  const { memberId = null, mode = "include", enabled = true } = options;
  const terms = useMemo(
    () => ingredientTerms.map((t) => t.trim()).filter(Boolean),
    [ingredientTerms.join(",")]
  );
  const queryEnabled = !!user && enabled;

  const { data: rawIds, isLoading } = useQuery({
    queryKey: recipeIdsByIngredientsKey(user?.id ?? undefined, terms, scope, memberId ?? null, mode),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("get_recipe_ids_by_ingredients", {
        ingredient_terms: terms,
        mode,
        scope,
        p_member_id: memberId ?? null,
      });
      if (error) throw error;
      if (!Array.isArray(data)) return [];
      return data.map((row: unknown) =>
        typeof row === "string" ? row : (row as { id: string }).id
      );
    },
    enabled: queryEnabled && terms.length > 0,
    staleTime: STALE_MS,
  });

  const allowedRecipeIds = useMemo(() => {
    if (terms.length === 0) return undefined;
    if (!rawIds) return undefined;
    return new Set<string>(rawIds);
  }, [terms.length, rawIds]);

  return { allowedRecipeIds, isLoading: queryEnabled && terms.length > 0 ? isLoading : false };
}
