import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { detectCategory, ensureProductCategory, resolveUnit, usePiecesFallback, shouldUsePiecesByDescription } from '@/utils/productUtils';
import { parseIngredient } from '@/utils/parseIngredient';
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

  // Получить элементы списка покупок с названиями рецептов
  const getListItems = (listId: string) => {
    return useQuery({
      queryKey: ['shopping_list_items', listId],
      queryFn: async () => {
        // Join с recipes для имён рецептов во вкладке «По рецептам»: без join нет заголовков
        const { data, error } = await supabase
          .from('shopping_list_items')
          .select('*, recipes(id, title)')
          .eq('shopping_list_id', listId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        // recipeTitle: из join recipes.title, иначе сохранённый recipe_title (фоллбек для чата)
        return (data || []).map((item: any) => {
          const fromRecipes = item.recipes?.title ?? item.recipe?.title;
          const recipeTitle = fromRecipes ?? item.recipe_title ?? null;
          return {
            ...item,
            recipe_id: item.recipe_id ?? null,
            recipe_title: item.recipe_title ?? null,
            recipeTitle,
          };
        }) as (ShoppingListItem & { recipeTitle?: string | null })[];
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

  // В shopping_list_items подставляем только реальный UUID из таблицы recipes (не temp-* и не произвольные строки)
  const isValidRecipeUuid = (id: string | null | undefined): id is string =>
    typeof id === 'string' && id.length > 0 && !id.startsWith('temp-') &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

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

    // Объемные единицы: проверяем мл ПЕРЕД л, иначе "мл" матчится на "л"
    if (lowerUnit.includes('мл') || lowerUnit.includes('миллилитр')) {
      return { normalized: 'мл', multiplier: 1 };
    }
    if (lowerUnit === 'л' || lowerUnit.includes('литр')) {
      return { normalized: 'л', multiplier: 1000 }; // конвертируем в миллилитры
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

      // Категория строго enum product_category
      const rawCategory = item.category && item.category !== 'other' ? item.category : detectCategory(item.name);
      const finalCategory = ensureProductCategory(rawCategory);

      // Единица измерения обязательна: берём переданную или определяем по названию
      let finalUnit = resolveUnit(item.unit, item.name);
      let effectiveNewAmount: number | null = item.amount ?? (finalUnit === "шт" ? 1 : null);

      // Пюре, творог: г/мл без числа → шт. Описания с «или»/«— 2-3 ст.л.» и т.п. → тоже шт.
      if (usePiecesFallback(finalUnit, item.amount) || shouldUsePiecesByDescription(item.name)) {
        finalUnit = 'шт';
        effectiveNewAmount = 1;
      }

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

      // Ищем существующий продукт: по имени + одинаковой единице ИЛИ fallback (шт) + существующий г/мл с 0
      const existingBySameUnit = existingItems?.find((existing) => {
        const existingNormalizedName = normalizeProductName(existing.name);
        if (existingNormalizedName !== normalizedName) return false;
        const existingUnitResolved = resolveUnit(existing.unit, existing.name);
        const existingUnitNormalized = normalizeUnit(existingUnitResolved);
        return itemUnitNormalized.normalized === existingUnitNormalized.normalized;
      });

      const existingGmlZero = !existingBySameUnit && existingItems?.find((existing) => {
        const existingNormalizedName = normalizeProductName(existing.name);
        if (existingNormalizedName !== normalizedName) return false;
        const existingUnitResolved = resolveUnit(existing.unit, existing.name);
        const u = existingUnitResolved?.toLowerCase().trim() || '';
        const isGml = u === 'г' || u === 'мл' || u === 'кг' || u === 'л';
        const amt = existing.amount ?? 0;
        return isGml && (amt === 0 || amt == null);
      });

      const existingItem = existingBySameUnit ?? existingGmlZero;

      if (existingItem) {
        const existingUnitResolved = resolveUnit(existingItem.unit, existingItem.name);
        const existingUnitNormalized = normalizeUnit(existingUnitResolved);
        const effectiveExisting = existingItem.amount ?? (existingUnitResolved === "шт" ? 1 : 0);

        let newAmount: number;
        let newUnit: string;

        if (existingGmlZero) {
          // Слияние fallback (шт 1) с существующим "г/мл" 0 → переводим в "шт", считаем штуками
          newUnit = 'шт';
          newAmount = 1 + (effectiveNewAmount ?? 1);
        } else if (
          (existingUnitNormalized.normalized === 'г' || existingUnitNormalized.normalized === 'мл' || existingUnitNormalized.normalized === 'л' || existingUnitNormalized.normalized === 'кг') &&
          effectiveExisting === 0 && (effectiveNewAmount ?? 0) === 0
        ) {
          // Оба г/мл с 0 → переводим в "шт" 2
          newUnit = 'шт';
          newAmount = 2;
        } else {
          const existingAmountBase = convertToBaseUnit(effectiveExisting, existingUnitResolved);
          const newAmountBase = convertToBaseUnit(effectiveNewAmount ?? 0, finalUnit);
          const totalAmountBase = existingAmountBase + newAmountBase;
          newUnit = existingItem.unit ?? existingUnitResolved;
          if (existingUnitNormalized.multiplier > 1) {
            newAmount = totalAmountBase / existingUnitNormalized.multiplier;
          } else {
            newAmount = totalAmountBase;
          }
        }

        const { data, error } = await supabase
          .from('shopping_list_items')
          .update({
            amount: newAmount,
            category: finalCategory,
            unit: newUnit,
          })
          .eq('id', existingItem.id)
          .select()
          .single();

        if (error) {
          console.error('DB Error in addItem (update):', error.message, 'Details:', error.details);
          throw error;
        }
        return data as ShoppingListItem;
      } else {
        const insertAmount = effectiveNewAmount ?? (finalUnit === "шт" ? 1 : null);
        const { data, error } = await supabase
          .from('shopping_list_items')
          .insert({
            ...item,
            shopping_list_id: listId,
            category: finalCategory,
            unit: finalUnit,
            amount: insertAmount,
          })
          .select()
          .single();

        if (error) {
          console.error('DB Error in addItem (insert):', error.message, 'Details:', error.details);
          throw error;
        }
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

      if (error) {
        console.error('SYNC ERROR:', error.message, error.details);
        throw error;
      }
      return listId;
    },
    onSuccess: (listId) => {
      queryClient.invalidateQueries({ queryKey: ['shopping_list_items', listId] });
    },
  });

  // Добавить ингредиенты рецепта в список одним батч-запросом (из избранного/рецепта/чата)
  const addItemsFromRecipe = useMutation({
    mutationFn: async (
      ingredients: string[],
      options?: {
        listId?: string;
        recipeId?: string | null;
        recipeTitle?: string;
        /** Рецепт из чата (ИИ): создаём запись в recipes и подставляем её id в shopping_list_items */
        createRecipeFromChat?: { title: string; description?: string; cookingTime?: number };
      }
    ) => {
      if (!user) throw new Error('User not authenticated');

      let listId = options?.listId ?? activeList?.id;
      if (!listId) {
        await supabase.from('shopping_lists').update({ is_active: false }).eq('user_id', user.id).eq('is_active', true);
        const { data: newListData, error: createErr } = await supabase
          .from('shopping_lists')
          .insert({ user_id: user.id, name: 'Список покупок', is_active: true })
          .select()
          .single();
        if (createErr) {
          console.error('DB Error in addItemsFromRecipe (createList):', createErr.message, 'Details:', createErr.details);
          throw createErr;
        }
        listId = newListData.id;
        queryClient.invalidateQueries({ queryKey: ['shopping_lists', user?.id] });
      }

      let recipeId: string | null = options?.recipeId ?? null;
      if (!recipeId && options?.createRecipeFromChat) {
        const { title, description, cookingTime } = options.createRecipeFromChat;
        const { data: newRecipe, error: recipeErr } = await supabase
          .from('recipes')
          .insert({
            user_id: user.id,
            title: title || 'Рецепт из чата',
            description: description ?? null,
            cooking_time_minutes: cookingTime != null ? Math.round(Number(cookingTime)) : null,
          })
          .select('id')
          .single();
        if (recipeErr) {
          console.error('DB Error in addItemsFromRecipe (createRecipe):', recipeErr.message, 'Details:', recipeErr.details);
          throw recipeErr;
        }
        recipeId = newRecipe?.id != null ? String(newRecipe.id) : null;
        if (recipeId) {
          queryClient.invalidateQueries({ queryKey: ['recipes', user.id] });
          console.log('Saving items for Recipe ID:', recipeId);
        }
      }

      if (!ingredients?.length) return listId;

      const { data: existingItems, error: existingError } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('shopping_list_id', listId)
        .eq('is_purchased', false);
      if (existingError) {
        console.error('DB Error in addItemsFromRecipe (select):', existingError.message, 'Details:', existingError.details);
        throw existingError;
      }

      const existingMap = new Map<string, ShoppingListItem>();
      const existingGmlZeroMap = new Map<string, ShoppingListItem>();
      (existingItems || []).forEach((item) => {
        const resolved = resolveUnit(item.unit, item.name);
        const unitNorm = normalizeUnit(resolved);
        const n = normalizeProductName(item.name);
        existingMap.set(`${n}|${unitNorm.normalized}`, item);
        const u = (resolved || '').toLowerCase().trim();
        const isGml = u === 'г' || u === 'мл' || u === 'кг' || u === 'л';
        if (isGml && (item.amount ?? 0) === 0) existingGmlZeroMap.set(n, item);
      });

      const toInsert: ShoppingListItemInsert[] = [];
      const toUpdate: Array<{ id: string; amount: number; unit: string; category: import('@/utils/productUtils').ProductCategory }> = [];
      const updatedIds = new Set<string>();

      for (const raw of ingredients) {
        const parsed = parseIngredient(raw);
        const name = parsed.name?.trim();
        if (!name) continue;
        let resolvedUnit = resolveUnit(parsed.unit, name);
        let amount = parsed.quantity ?? (resolvedUnit === 'шт' ? 1 : null);
        if (usePiecesFallback(resolvedUnit, amount) || shouldUsePiecesByDescription(name)) {
          resolvedUnit = 'шт';
          amount = 1;
        }
        const category = ensureProductCategory(detectCategory(name));
        const normalizedName = normalizeProductName(name);
        const unitNorm = normalizeUnit(resolvedUnit);
        const key = `${normalizedName}|${unitNorm.normalized}`;
        let existing = existingMap.get(key);
        if (!existing && resolvedUnit === 'шт') {
          const gmlZero = existingGmlZeroMap.get(normalizedName);
          if (gmlZero && !updatedIds.has(gmlZero.id)) existing = gmlZero;
        }
        if (existing) {
          const existingUnitResolved = resolveUnit(existing.unit, existing.name);
          const existingUnitNorm = normalizeUnit(existingUnitResolved);
          const existingAmount = existing.amount ?? (existingUnitResolved === 'шт' ? 1 : 0);
          let newAmount: number;
          let newUnit: string;
          if (existing.amount == null || existing.amount === 0) {
            newUnit = 'шт';
            newAmount = (amount ?? 1) + 1;
          } else {
            const baseExisting = convertToBaseUnit(existingAmount, existingUnitResolved);
            const baseNew = convertToBaseUnit(amount ?? 0, resolvedUnit);
            newUnit = existing.unit ?? existingUnitResolved;
            const totalBase = baseExisting + baseNew;
            if (existingUnitNorm.multiplier > 1) newAmount = totalBase / existingUnitNorm.multiplier;
            else newAmount = totalBase;
          }
          updatedIds.add(existing.id);
          toUpdate.push({ id: existing.id, amount: newAmount, unit: newUnit, category });
        } else {
          toInsert.push({
            shopping_list_id: listId,
            name: name.charAt(0).toUpperCase() + name.slice(1),
            amount: amount ?? null,
            unit: resolvedUnit,
            category,
            is_purchased: false,
            // recipe_id — UUID из таблицы recipes (при добавлении со страницы рецепта); иначе null (чат/избранное)
            recipe_id: isValidRecipeUuid(recipeId ?? options?.recipeId) ? (recipeId ?? options?.recipeId!) : null,
            recipe_title: options?.recipeTitle ?? null,
          });
        }
      }

      for (const u of toUpdate) {
        const { error: updateErr } = await supabase
          .from('shopping_list_items')
          .update({ amount: u.amount, unit: u.unit, category: u.category })
          .eq('id', u.id);
        if (updateErr) {
          console.error('DB Error in addItemsFromRecipe (update):', updateErr.message, 'Details:', updateErr.details);
          throw updateErr;
        }
      }
      if (toInsert.length > 0) {
        const { error: insertErr } = await supabase.from('shopping_list_items').insert(toInsert);
        if (insertErr) {
          console.error('DB Error in addItemsFromRecipe (insert):', insertErr.message, 'Details:', insertErr.details);
          throw insertErr;
        }
      }
      return listId;
    },
    onSuccess: (listId) => {
      queryClient.invalidateQueries({ queryKey: ['shopping_list_items', listId] });
    },
  });

  // Очистить элементы списка по категории
  const clearCategoryItems = useMutation({
    mutationFn: async ({ listId, category }: { listId: string; category: string }) => {
      let query = supabase
        .from('shopping_list_items')
        .delete()
        .eq('shopping_list_id', listId);

      if (category === 'other') {
        query = query.or('category.eq.other,category.is.null');
      } else {
        query = query.eq('category', category);
      }

      const { error } = await query;
      if (error) throw error;
      return { listId, category };
    },
    onSuccess: ({ listId }) => {
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
            id,
            title,
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
      // Ключ: normalizedName|normalizedUnit, значение: данные + список рецептов
      const ingredientsMap = new Map<string, {
        amount: number;
        unit: string;
        category: import('@/utils/productUtils').ProductCategory;
        name: string;
        recipeIds: string[];
        recipeTitles: string[];
      }>();

      mealPlans.forEach((plan: any) => {
        if (plan.recipe?.recipe_ingredients) {
          const recipeId = plan.recipe.id;
          const recipeTitle = plan.recipe.title || 'Без названия';

          plan.recipe.recipe_ingredients.forEach((ing: any) => {
            // Парсим ингредиент из сырой строки
            const parsed = parseIngredient(ing.name);

            // Используем распарсенные данные
            const cleanName = parsed.name || ing.name;
            const parsedQuantity = parsed.quantity;
            const parsedUnit = parsed.unit;

            // Определяем финальные значения
            let resolvedUnit = resolveUnit(parsedUnit || ing.unit, cleanName);
            let amt = parsedQuantity ?? (ing.amount != null ? ing.amount : (resolvedUnit === "шт" ? 1 : 0));

            if (usePiecesFallback(resolvedUnit, amt) || shouldUsePiecesByDescription(cleanName)) {
              resolvedUnit = 'шт';
              amt = amt || 1;
            }

            const normalizedName = normalizeProductName(cleanName);
            const unitNormalized = normalizeUnit(resolvedUnit);
            const key = `${normalizedName}|${unitNormalized.normalized}`;
            const autoCategory = ensureProductCategory(detectCategory(cleanName));

            if (ingredientsMap.has(key)) {
              const existing = ingredientsMap.get(key)!;
              const existingAmountBase = convertToBaseUnit(existing.amount, existing.unit);
              const newAmountBase = convertToBaseUnit(amt, resolvedUnit);
              const totalAmountBase = existingAmountBase + newAmountBase;
              existing.amount = totalAmountBase / unitNormalized.multiplier;
              // Добавляем рецепт в список, если его еще нет
              if (!existing.recipeIds.includes(recipeId)) {
                existing.recipeIds.push(recipeId);
                existing.recipeTitles.push(recipeTitle);
              }
            } else {
              ingredientsMap.set(key, {
                name: cleanName,
                amount: amt,
                unit: resolvedUnit,
                category: autoCategory,
                recipeIds: [recipeId],
                recipeTitles: [recipeTitle],
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
      const existingGmlZeroMap = new Map<string, ShoppingListItem>();
      if (existingItems) {
        existingItems.forEach((item) => {
          const resolved = resolveUnit(item.unit, item.name);
          const unitNormalized = normalizeUnit(resolved);
          const n = normalizeProductName(item.name);
          const key = `${n}|${unitNormalized.normalized}`;
          existingItemsMap.set(key, item);
          const u = (resolved || '').toLowerCase().trim();
          const isGml = u === 'г' || u === 'мл' || u === 'кг' || u === 'л';
          const amt = item.amount ?? 0;
          if (isGml && (amt === 0 || item.amount == null)) {
            if (!existingGmlZeroMap.has(n)) existingGmlZeroMap.set(n, item);
          }
        });
      }

      const itemsToInsert: any[] = [];
      const itemsToUpdate: Array<{ id: string; amount: number; category: import('@/utils/productUtils').ProductCategory; unit: string }> = [];
      const updatedIds = new Set<string>();

      Array.from(ingredientsMap.values()).forEach((data) => {
        const normalizedName = normalizeProductName(data.name);
        const unitNormalized = normalizeUnit(data.unit);
        const key = `${normalizedName}|${unitNormalized.normalized}`;
        let existingItem = existingItemsMap.get(key);
        if (!existingItem && data.unit === 'шт') {
          const gmlZero = existingGmlZeroMap.get(normalizedName);
          if (gmlZero && !updatedIds.has(gmlZero.id)) {
            existingItem = gmlZero;
          }
        }

        if (existingItem) {
          const existingUnitResolved = resolveUnit(existingItem.unit, existingItem.name);
          const existingUnitNormalized = normalizeUnit(existingUnitResolved);
          const u = (existingUnitResolved || '').toLowerCase().trim();
          const isGmlZero = (u === 'г' || u === 'мл' || u === 'кг' || u === 'л') &&
            ((existingItem.amount ?? 0) === 0 || existingItem.amount == null);

          let newAmount: number;
          let newUnit: string;

          if (isGmlZero) {
            newUnit = 'шт';
            newAmount = 1 + data.amount;
          } else {
            const existingAmountBase = convertToBaseUnit(existingItem.amount, existingUnitResolved);
            const newAmountBase = convertToBaseUnit(data.amount, data.unit);
            const totalAmountBase = existingAmountBase + newAmountBase;
            newUnit = existingItem.unit ?? existingUnitResolved;
            if (existingUnitNormalized.multiplier > 1) {
              newAmount = totalAmountBase / existingUnitNormalized.multiplier;
            } else {
              newAmount = totalAmountBase;
            }
          }

          updatedIds.add(existingItem.id);
          itemsToUpdate.push({
            id: existingItem.id,
            amount: newAmount,
            category: data.category,
            unit: newUnit,
          });
        } else {
          // Используем первый recipe_id из списка (если есть несколько рецептов с одинаковым продуктом)
          itemsToInsert.push({
            shopping_list_id: listId!,
            name: data.name.charAt(0).toUpperCase() + data.name.slice(1),
            amount: data.amount || null,
            unit: data.unit,
            category: ensureProductCategory(data.category),
            is_purchased: false,
            recipe_id: data.recipeIds.length > 0 ? data.recipeIds[0] : null,
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
            category: item.category,
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
    clearCategoryItems: clearCategoryItems.mutateAsync,
    addItemsFromRecipe: addItemsFromRecipe.mutateAsync,
    isCreating: createList.isPending,
    isGenerating: generateFromMealPlans.isPending,
    isClearing: clearAllItems.isPending,
    isClearingCategory: clearCategoryItems.isPending,
  };
}
