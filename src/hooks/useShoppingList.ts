import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { mapDbProductCategoryToShoppingAisle } from "@/utils/shopping/mapDbProductCategoryToShoppingAisle";

export type ProductCategory = "vegetables" | "fruits" | "dairy" | "meat" | "grains" | "other";

export interface SourceRecipe {
  id: string;
  title: string;
}

export interface ShoppingListItemRow {
  id: string;
  shopping_list_id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  category: ProductCategory | null;
  is_purchased: boolean | null;
  recipe_id: string | null;
  recipe_title: string | null;
  meta?: { source_recipes?: SourceRecipe[] } | null;
}

/** Источники рецептов для строки: из meta или из recipe_id/recipe_title. */
export function getSourceRecipesFromItem(row: ShoppingListItemRow): SourceRecipe[] {
  const fromMeta = row.meta?.source_recipes;
  if (fromMeta && fromMeta.length > 0) return fromMeta;
  if (row.recipe_id) return [{ id: row.recipe_id, title: row.recipe_title ?? "" }];
  return [];
}

const LIST_QUERY_KEY = ["shopping_list_active"] as const;
const ITEMS_QUERY_KEY = (listId: string | null) => ["shopping_list_items", listId] as const;

export interface ShoppingListSyncMeta {
  last_synced_range?: "today" | "week";
  last_synced_member_id?: string | null;
  last_synced_plan_signature?: string;
  last_synced_at?: string;
}

export interface ShoppingListRow {
  id: string;
  name: string;
  meta?: { [key: string]: unknown } | null;
}

/** Получить или создать активный список (один на user). */
async function getOrCreateActiveList(userId: string): Promise<ShoppingListRow> {
  const { data: existing } = await supabase
    .from("shopping_lists")
    .select("id, name, meta")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (existing) return existing as ShoppingListRow;
  const { data: inserted, error } = await supabase
    .from("shopping_lists")
    .insert({ user_id: userId, name: "Список покупок", is_active: true })
    .select("id, name, meta")
    .single();
  if (error) throw error;
  return inserted as ShoppingListRow;
}

export function useShoppingList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: LIST_QUERY_KEY,
    queryFn: async () => {
      if (!user) return null;
      return getOrCreateActiveList(user.id);
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const listId = listQuery.data?.id ?? null;
  const listMeta = (listQuery.data?.meta as ShoppingListSyncMeta | undefined) ?? undefined;

  const itemsQuery = useQuery({
    queryKey: ITEMS_QUERY_KEY(listId),
    queryFn: async (): Promise<ShoppingListItemRow[]> => {
      if (!listId) return [];
      const q = supabase
        .from("shopping_list_items")
        .select("id, shopping_list_id, name, amount, unit, category, is_purchased, recipe_id, recipe_title, meta")
        .eq("shopping_list_id", listId)
        .order("created_at", { ascending: true });
      const { data, error } = (await q) as { data: ShoppingListItemRow[] | null; error: { message: string } | null };
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        category: mapDbProductCategoryToShoppingAisle(row.category as string | null),
      }));
    },
    enabled: !!listId,
    staleTime: 30_000,
  });

  const setItemPurchased = useMutation({
    mutationFn: async ({ itemId, is_purchased }: { itemId: string; is_purchased: boolean }) => {
      const { error } = await supabase
        .from("shopping_list_items")
        .update({ is_purchased })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (listId) queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY(listId) });
    },
  });

  const clearList = useMutation({
    mutationFn: async () => {
      if (!user || !listId) return;
      const { error } = await supabase.from("shopping_list_items").delete().eq("shopping_list_id", listId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (listId) queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY(listId) });
    },
  });

  const replaceItems = useMutation({
    mutationFn: async (params: {
      items: {
        name: string;
        amount: number | null;
        unit: string | null;
        category: ProductCategory | null;
        source_recipes?: SourceRecipe[];
      }[];
      syncMeta?: ShoppingListSyncMeta;
    }) => {
      if (!listId) throw new Error("No active list");
      const { items, syncMeta } = params;
      const { error: delErr } = await supabase.from("shopping_list_items").delete().eq("shopping_list_id", listId);
      if (delErr) throw delErr;
      if (items.length > 0) {
        const rows = items.map((item) => ({
          shopping_list_id: listId,
          name: item.name,
          amount: item.amount,
          unit: item.unit,
          category: item.category ?? "other",
          meta: item.source_recipes?.length ? { source_recipes: item.source_recipes } : null,
        }));
        const { error: insErr } = await supabase.from("shopping_list_items").insert(rows);
        if (insErr) throw insErr;
      }
      if (syncMeta) {
        const { data: current } = await supabase.from("shopping_lists").select("meta").eq("id", listId).single();
        const prev = (current?.meta as Record<string, unknown>) ?? {};
        const next = { ...prev, ...syncMeta };
        await supabase.from("shopping_lists").update({ meta: next }).eq("id", listId);
      }
    },
    onSuccess: () => {
      if (listId) {
        queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY(listId) });
        queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY });
      }
    },
  });

  const addRecipeIngredients = useMutation({
    mutationFn: async (params: {
      ingredients: { name: string; amount: number | null; unit: string | null; category?: ProductCategory | null }[];
      recipeId?: string | null;
      recipeTitle?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const list = await getOrCreateActiveList(user.id);
      type ExRow = { id: string; name: string; amount: number | null; unit: string | null; meta?: { source_recipes?: SourceRecipe[] } | null; recipe_id?: string | null; recipe_title?: string | null };
      const existingRes = (await supabase
        .from("shopping_list_items")
        .select("id, name, amount, unit, is_purchased, meta, recipe_id, recipe_title")
        .eq("shopping_list_id", list.id)
        .eq("is_purchased", false)) as { data: ExRow[] | null; error: { message: string } | null };
      if (existingRes.error) throw existingRes.error;
      const existingMap = new Map<string, ExRow>(
        (existingRes.data ?? []).map((r) => [`${(r.name ?? "").trim().toLowerCase()}|${(r.unit ?? "")}`, r])
      );
      const newRecipe: SourceRecipe | null =
        params.recipeId != null
          ? { id: params.recipeId, title: (params.recipeTitle ?? "").trim() }
          : null;
      function mergeMeta(row: ExRow, recipe: SourceRecipe | null): { source_recipes: SourceRecipe[] } | null {
        const existing = row.meta?.source_recipes ?? (row.recipe_id ? [{ id: row.recipe_id, title: row.recipe_title ?? "" }] : []);
        const byId = new Map(existing.map((r) => [r.id, r]));
        if (recipe) byId.set(recipe.id, recipe);
        const arr = [...byId.values()];
        return arr.length > 0 ? { source_recipes: arr } : null;
      }
      for (const ing of params.ingredients) {
        const key = `${ing.name.trim().toLowerCase()}|${ing.unit ?? ""}`;
        const ex = existingMap.get(key);
        if (ex) {
          const newAmount = (ex.amount ?? 0) + (ing.amount ?? 0);
          const merged = mergeMeta(ex, newRecipe);
          await supabase
            .from("shopping_list_items")
            .update({ amount: newAmount, meta: merged })
            .eq("id", ex.id);
        } else {
          await supabase.from("shopping_list_items").insert({
            shopping_list_id: list.id,
            name: ing.name.trim(),
            amount: ing.amount,
            unit: ing.unit ?? null,
            category: ing.category ?? "other",
            recipe_id: params.recipeId ?? null,
            recipe_title: params.recipeTitle ?? null,
            meta: newRecipe ? { source_recipes: [newRecipe] } : null,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["shopping_list_items"] });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("shopping_list_items").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (listId) queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY(listId) });
    },
  });

  const insertItem = useMutation({
    mutationFn: async (item: {
      name: string;
      amount: number | null;
      unit: string | null;
      category: ProductCategory | null;
      source_recipes?: SourceRecipe[];
    }) => {
      if (!listId) throw new Error("No active list");
      const { error } = await supabase.from("shopping_list_items").insert({
        shopping_list_id: listId,
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        category: item.category ?? "other",
        meta: item.source_recipes?.length ? { source_recipes: item.source_recipes } : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      if (listId) queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY(listId) });
    },
  });

  const removePurchased = useMutation({
    mutationFn: async () => {
      if (!listId) return;
      const { error } = await supabase
        .from("shopping_list_items")
        .delete()
        .eq("shopping_list_id", listId)
        .eq("is_purchased", true);
      if (error) throw error;
    },
    onSuccess: () => {
      if (listId) queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY(listId) });
    },
  });

  const updateListSyncMeta = useMutation({
    mutationFn: async (syncMeta: ShoppingListSyncMeta) => {
      if (!listId) throw new Error("No active list");
      const { data: current } = await supabase.from("shopping_lists").select("meta").eq("id", listId).single();
      const prev = (current?.meta as Record<string, unknown>) ?? {};
      const next = { ...prev, ...syncMeta };
      const { error } = await supabase.from("shopping_lists").update({ meta: next }).eq("id", listId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY });
    },
  });

  return {
    listId,
    listName: listQuery.data?.name ?? null,
    listMeta,
    items: itemsQuery.data ?? [],
    isLoading: listQuery.isLoading || itemsQuery.isLoading,
    setItemPurchased: setItemPurchased.mutateAsync,
    clearList: clearList.mutateAsync,
    replaceItems: replaceItems.mutateAsync,
    addRecipeIngredients: addRecipeIngredients.mutateAsync,
    isAddingToList: addRecipeIngredients.isPending,
    deleteItem: deleteItem.mutateAsync,
    insertItem: insertItem.mutateAsync,
    removePurchased: removePurchased.mutateAsync,
    updateListSyncMeta: updateListSyncMeta.mutateAsync,
    refetchList: listQuery.refetch,
    refetchItems: itemsQuery.refetch,
  };
}
