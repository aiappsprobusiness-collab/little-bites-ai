import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { detectCategory, resolveUnit } from '@/utils/productUtils';
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

  // Нормализовать название продукта для сравнения
  const normalizeProductName = (name: string): string => {
    return name.toLowerCase().trim();
  };

  // Нормализовать и конвертировать единицы измерения для сравнения
  const normalizeUnit = (unit: string | null | undefined): { normalized: string; multiplier: number } => {
    if (!unit) return { normalized: '', multiplier: 1 };
    
    const lowerUnit = unit.toLowerCase().trim();
    
    // Весовые единицы
    if (lowerUnit.includes('кг') || lowerUnit.includes('килограмм')) {
      return { normalized: 'кг', multiplier: 1000 }; // конвертируем в граммы
    }
    if (lowerUnit.includes('г') || lowerUnit.includes('грамм')) {
      return { normalized: 'г', multiplier: 1 };
    }
    
    // Объемные единицы
    if (lowerUnit.includes('л') || lowerUnit.includes('литр')) {
      return { normalized: 'л', multiplier: 1000 }; // конвертируем в миллилитры
    }
    if (lowerUnit.includes('мл') || lowerUnit.includes('миллилитр')) {
      return { normalized: 'мл', multiplier: 1 };
    }
    
    // Штуки
    if (lowerUnit.includes('шт') || lowerUnit.includes('штук')) {
      return { normalized: 'шт', multiplier: 1 };
    }
    
    // По умолчанию возвращаем как есть
    return { normalized: lowerUnit, multiplier: 1 };
  };

  // Конвертировать количество в базовую единицу
  const convertToBaseUnit = (amount: number | null, unit: string | null | undefined): number => {
    if (!amount) return 0;
    const normalized = normalizeUnit(unit);
    return amount * normalized.multiplier;
  };

  // Добавить элемент в список (с объединением одинаковых продуктов)
  const addItem = useMutation({
    mutationFn: async (item: Omit<ShoppingListItemInsert, 'shopping_list_id'> & { shopping_list_id?: string }) => {
      const listId = item.shopping_list_id || activeList?.id;
      if (!listId) throw new Error('No active shopping list');

      // Автоматически определяем категорию, если она не указана или равна "other"
      const finalCategory = item.category && item.category !== 'other' 
        ? item.category 
        : detectCategory(item.name);

      // Единица измерения обязательна: берём переданную или определяем по названию
      const finalUnit = resolveUnit(item.unit, item.name);

      // Нормализуем название для поиска
      const normalizedName = normalizeProductName(item.name);

      // Проверяем, есть ли уже такой продукт в списке
      const { data: existingItems, error: searchError } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('shopping_list_id', listId)
        .eq('is_purchased', false);

      if (searchError) throw searchError;

      // Нормализуем единицы измерения для сравнения
      const itemUnitNormalized = normalizeUnit(finalUnit);
      
      // Ищем существующий продукт с таким же нормализованным названием
      // Проверяем, можно ли объединить единицы измерения (граммы/килограммы, миллилитры/литры)
      const existingItem = existingItems?.find(
        (existing) => {
          const existingNormalizedName = normalizeProductName(existing.name);
          if (existingNormalizedName !== normalizedName) return false;
          
          const existingUnitResolved = resolveUnit(existing.unit, existing.name);
          const existingUnitNormalized = normalizeUnit(existingUnitResolved);
          
          // Если единицы одинаковые (после нормализации) - объединяем
          if (itemUnitNormalized.normalized === existingUnitNormalized.normalized) {
            return true;
          }
          
          return false;
        }
      );

      if (existingItem) {
        // Если продукт уже есть, суммируем количество с учетом единиц измерения
        const existingUnitResolved = resolveUnit(existingItem.unit, existingItem.name);
        const existingUnitNormalized = normalizeUnit(existingUnitResolved);
        
        // Конвертируем оба количества в базовые единицы
        const existingAmountBase = convertToBaseUnit(existingItem.amount, existingUnitResolved);
        const newAmountBase = convertToBaseUnit(item.amount, finalUnit);
        const totalAmountBase = existingAmountBase + newAmountBase;
        
        // Конвертируем обратно в исходную единицу существующего продукта
        let newAmount: number;
        if (existingUnitNormalized.multiplier > 1) {
          // Если единица была в килограммах/литрах, конвертируем обратно
          newAmount = totalAmountBase / existingUnitNormalized.multiplier;
        } else {
          newAmount = totalAmountBase;
        }
        
        const { data, error } = await supabase
          .from('shopping_list_items')
          .update({
            amount: newAmount,
            category: finalCategory as any,
            // Исправляем unit, если у существующего продукта не было меры
            unit: existingItem.unit ?? existingUnitResolved,
          })
          .eq('id', existingItem.id)
          .select()
          .single();

        if (error) throw error;
        return data as ShoppingListItem;
      } else {
        // Если продукта нет, добавляем новый с категорией и единицей измерения
        const { data, error } = await supabase
          .from('shopping_list_items')
          .insert({
            ...item,
            shopping_list_id: listId,
            category: finalCategory as any,
            unit: finalUnit,
          })
          .select()
          .single();

        if (error) throw error;
        return data as ShoppingListItem;
      }
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

  // Очистить все элементы списка
  const clearAllItems = useMutation({
    mutationFn: async (listId: string) => {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('shopping_list_id', listId);

      if (error) throw error;
      return listId;
    },
    onSuccess: (listId) => {
      queryClient.invalidateQueries({ queryKey: ['shopping_list_items', listId] });
    },
  });

  // Генерировать список покупок из планов питания
  const generateFromMealPlans = useMutation({
    mutationFn: async ({ startDate, endDate }: { startDate: Date; endDate: Date }) => {
      if (!user) throw new Error('User not authenticated');

      console.log('Генерация списка покупок:', { startDate, endDate, userId: user.id });

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

      if (mealPlansError) {
        console.error('Ошибка получения планов питания:', mealPlansError);
        throw mealPlansError;
      }

      console.log('Найдено планов питания:', mealPlans?.length || 0, mealPlans);

      if (!mealPlans || mealPlans.length === 0) {
        throw new Error('Нет планов питания на эту неделю. Сначала создайте план питания.');
      }

      // Собрать все ингредиенты (объединяем одинаковые продукты с одинаковыми единицами)
      const ingredientsMap = new Map<string, { amount: number; unit: string; category: string; name: string }>();

      mealPlans.forEach((plan: any) => {
        if (plan.recipe?.recipe_ingredients) {
          plan.recipe.recipe_ingredients.forEach((ing: any) => {
            const resolvedUnit = resolveUnit(ing.unit, ing.name);
            const normalizedName = normalizeProductName(ing.name);
            const unitNormalized = normalizeUnit(resolvedUnit);
            const key = `${normalizedName}|${unitNormalized.normalized}`;
            const autoCategory = detectCategory(ing.name);

            if (ingredientsMap.has(key)) {
              const existing = ingredientsMap.get(key)!;
              const existingAmountBase = convertToBaseUnit(existing.amount, existing.unit);
              const newAmountBase = convertToBaseUnit(ing.amount, resolvedUnit);
              const totalAmountBase = existingAmountBase + newAmountBase;
              existing.amount = totalAmountBase / unitNormalized.multiplier;
            } else {
              ingredientsMap.set(key, {
                name: ing.name,
                amount: ing.amount || 0,
                unit: resolvedUnit,
                category: autoCategory,
              });
            }
          });
        }
      });

      console.log('Собрано ингредиентов:', ingredientsMap.size);

      if (ingredientsMap.size === 0) {
        throw new Error('В рецептах не найдено ингредиентов');
      }

      // Создать или получить активный список
      let listId = activeList?.id;
      if (!listId) {
        const newList = await createList.mutateAsync('Список покупок');
        listId = newList.id;
      }

      // Получаем существующие продукты из списка (не купленные)
      const { data: existingItems, error: existingError } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('shopping_list_id', listId)
        .eq('is_purchased', false);

      if (existingError) {
        console.error('Ошибка получения существующих продуктов:', existingError);
        throw existingError;
      }

      // Создаем Map для существующих продуктов (ключ: название + единица; для null unit используем resolveUnit)
      const existingItemsMap = new Map<string, ShoppingListItem>();
      if (existingItems) {
        existingItems.forEach((item) => {
          const resolved = resolveUnit(item.unit, item.name);
          const unitNormalized = normalizeUnit(resolved);
          const key = `${normalizeProductName(item.name)}|${unitNormalized.normalized}`;
          existingItemsMap.set(key, item);
        });
      }

      const itemsToInsert: any[] = [];
      const itemsToUpdate: Array<{ id: string; amount: number; category: string; unit: string }> = [];

      Array.from(ingredientsMap.values()).forEach((data) => {
        const normalizedName = normalizeProductName(data.name);
        const unitNormalized = normalizeUnit(data.unit);
        const key = `${normalizedName}|${unitNormalized.normalized}`;
        const existingItem = existingItemsMap.get(key);

        if (existingItem) {
          const existingUnitResolved = resolveUnit(existingItem.unit, existingItem.name);
          const existingAmountBase = convertToBaseUnit(existingItem.amount, existingUnitResolved);
          const newAmountBase = convertToBaseUnit(data.amount, data.unit);
          const totalAmountBase = existingAmountBase + newAmountBase;
          const existingUnitNormalized = normalizeUnit(existingUnitResolved);
          let newAmount: number;
          if (existingUnitNormalized.multiplier > 1) {
            newAmount = totalAmountBase / existingUnitNormalized.multiplier;
          } else {
            newAmount = totalAmountBase;
          }
          itemsToUpdate.push({
            id: existingItem.id,
            amount: newAmount,
            category: data.category,
            unit: existingItem.unit ?? existingUnitResolved,
          });
        } else {
          itemsToInsert.push({
            shopping_list_id: listId!,
            name: data.name.charAt(0).toUpperCase() + data.name.slice(1),
            amount: data.amount || null,
            unit: data.unit,
            category: data.category as any,
            is_purchased: false,
          });
        }
      });

      console.log('Обновляем:', itemsToUpdate.length, 'продуктов');
      console.log('Добавляем:', itemsToInsert.length, 'новых продуктов');

      for (const item of itemsToUpdate) {
        const { error: updateError } = await supabase
          .from('shopping_list_items')
          .update({
            amount: item.amount,
            category: item.category as any,
            unit: item.unit,
          })
          .eq('id', item.id);

        if (updateError) {
          console.error('Ошибка обновления продукта:', updateError);
          throw updateError;
        }
      }

      // Добавляем новые продукты
      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase
          .from('shopping_list_items')
          .insert(itemsToInsert);

        if (itemsError) {
          console.error('Ошибка добавления продуктов:', itemsError);
          throw itemsError;
        }
      }

      return listId;
    },
    onSuccess: (listId) => {
      console.log('Список создан успешно:', listId);
      queryClient.invalidateQueries({ queryKey: ['shopping_lists', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['shopping_list_items', listId] });
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
    clearAllItems: clearAllItems.mutateAsync,
    isCreating: createList.isPending,
    isGenerating: generateFromMealPlans.isPending,
    isClearing: clearAllItems.isPending,
  };
}
