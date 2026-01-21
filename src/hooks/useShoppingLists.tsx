import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type ShoppingList = Tables<'shopping_lists'>;
type ShoppingListItem = Tables<'shopping_list_items'>;
type ShoppingListInsert = TablesInsert<'shopping_lists'>;
type ShoppingListUpdate = TablesUpdate<'shopping_lists'>;
type ShoppingListItemInsert = TablesInsert<'shopping_list_items'>;
type ShoppingListItemUpdate = TablesUpdate<'shopping_list_items'>;

export function useShoppingLists() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Получить активный список покупок
  const { data: activeList, isLoading: isLoadingList } = useQuery({
    queryKey: ['shopping_lists', user?.id, 'active'],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('shopping_lists')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      return data as ShoppingList | null;
    },
    enabled: !!user,
  });

  // Получить все списки покупок
  const { data: lists = [] } = useQuery({
    queryKey: ['shopping_lists', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('shopping_lists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ShoppingList[];
    },
    enabled: !!user,
  });

  // Получить элементы списка покупок
  const getListItems = (listId: string) => {
    return useQuery({
      queryKey: ['shopping_list_items', listId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('shopping_list_items')
          .select('*')
          .eq('shopping_list_id', listId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        return data as ShoppingListItem[];
      },
      enabled: !!listId,
    });
  };

  // Создать новый список покупок
  const createList = useMutation({
    mutationFn: async (name?: string) => {
      if (!user) throw new Error('User not authenticated');

      // Деактивировать все существующие списки
      await supabase
        .from('shopping_lists')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('is_active', true);

      // Создать новый активный список
      const { data, error } = await supabase
        .from('shopping_lists')
        .insert({
          user_id: user.id,
          name: name || 'Список покупок',
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ShoppingList;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping_lists', user?.id] });
    },
  });

  // Обновить список покупок
  const updateList = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & ShoppingListUpdate) => {
      const { data, error } = await supabase
        .from('shopping_lists')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ShoppingList;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping_lists', user?.id] });
    },
  });

  // Удалить список покупок
  const deleteList = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('shopping_lists')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping_lists', user?.id] });
    },
  });

  // Добавить элемент в список
  const addItem = useMutation({
    mutationFn: async (item: Omit<ShoppingListItemInsert, 'shopping_list_id'> & { shopping_list_id?: string }) => {
      const listId = item.shopping_list_id || activeList?.id;
      if (!listId) throw new Error('No active shopping list');

      const { data, error } = await supabase
        .from('shopping_list_items')
        .insert({
          ...item,
          shopping_list_id: listId,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ShoppingListItem;
    },
    onSuccess: (_, variables) => {
      const listId = variables.shopping_list_id || activeList?.id;
      queryClient.invalidateQueries({ queryKey: ['shopping_list_items', listId] });
    },
  });

  // Обновить элемент списка
  const updateItem = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & ShoppingListItemUpdate) => {
      const { data, error } = await supabase
        .from('shopping_list_items')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ShoppingListItem;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shopping_list_items', data.shopping_list_id] });
    },
  });

  // Удалить элемент списка
  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { data: item } = await supabase
        .from('shopping_list_items')
        .select('shopping_list_id')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return item?.shopping_list_id;
    },
    onSuccess: (listId) => {
      if (listId) {
        queryClient.invalidateQueries({ queryKey: ['shopping_list_items', listId] });
      }
    },
  });

  // Переключить статус покупки элемента
  const toggleItemPurchased = useMutation({
    mutationFn: async ({ id, isPurchased }: { id: string; isPurchased: boolean }) => {
      const { data, error } = await supabase
        .from('shopping_list_items')
        .update({ is_purchased: isPurchased })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ShoppingListItem;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shopping_list_items', data.shopping_list_id] });
    },
  });

  // Генерировать список покупок из планов питания
  const generateFromMealPlans = useMutation({
    mutationFn: async ({ startDate, endDate }: { startDate: Date; endDate: Date }) => {
      if (!user) throw new Error('User not authenticated');

      // Получить планы питания за период
      const { data: mealPlans, error: mealPlansError } = await supabase
        .from('meal_plans')
        .select(`
          recipe:recipes(
            recipe_ingredients(*)
          )
        `)
        .eq('user_id', user.id)
        .gte('planned_date', startDate.toISOString().split('T')[0])
        .lte('planned_date', endDate.toISOString().split('T')[0]);

      if (mealPlansError) throw mealPlansError;

      // Собрать все ингредиенты
      const ingredientsMap = new Map<string, { amount: number; unit: string; category: string }>();

      mealPlans.forEach((plan: any) => {
        if (plan.recipe?.recipe_ingredients) {
          plan.recipe.recipe_ingredients.forEach((ing: any) => {
            const key = ing.name.toLowerCase();
            if (ingredientsMap.has(key)) {
              const existing = ingredientsMap.get(key)!;
              existing.amount += ing.amount || 0;
            } else {
              ingredientsMap.set(key, {
                amount: ing.amount || 0,
                unit: ing.unit || '',
                category: ing.category || 'other',
              });
            }
          });
        }
      });

      // Создать или получить активный список
      let listId = activeList?.id;
      if (!listId) {
        const newList = await createList.mutateAsync();
        listId = newList.id;
      }

      // Добавить ингредиенты в список
      const items = Array.from(ingredientsMap.entries()).map(([name, data]) => ({
        shopping_list_id: listId!,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        amount: data.amount,
        unit: data.unit,
        category: data.category as any,
        is_purchased: false,
      }));

      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('shopping_list_items')
          .insert(items);

        if (itemsError) throw itemsError;
      }

      return listId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping_lists', user?.id] });
    },
  });

  return {
    activeList,
    lists,
    getListItems,
    isLoadingList,
    createList: createList.mutateAsync,
    updateList: updateList.mutateAsync,
    deleteList: deleteList.mutateAsync,
    addItem: addItem.mutateAsync,
    updateItem: updateItem.mutateAsync,
    deleteItem: deleteItem.mutateAsync,
    toggleItemPurchased: toggleItemPurchased.mutateAsync,
    generateFromMealPlans: generateFromMealPlans.mutateAsync,
    isCreating: createList.isPending,
    isGenerating: generateFromMealPlans.isPending,
  };
}
