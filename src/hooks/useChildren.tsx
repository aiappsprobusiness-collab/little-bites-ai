import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type Child = Tables<'children'>;
type ChildInsert = TablesInsert<'children'>;
type ChildUpdate = TablesUpdate<'children'>;

export function useChildren() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Получить всех детей пользователя
  const { data: children = [], isLoading, error } = useQuery({
    queryKey: ['children', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('children')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Нормализуем likes/dislikes: если пришли как JSON-строки, парсим их
      const normalized = (data || []).map((child) => {
        const normalizeArray = (arr: any): string[] => {
          if (Array.isArray(arr)) {
            // Проверяем, не является ли элемент массива JSON-строкой
            return arr
              .map((item) => {
                if (typeof item === 'string' && item.trim().startsWith('[') && item.trim().endsWith(']')) {
                  try {
                    const parsed = JSON.parse(item);
                    return Array.isArray(parsed) ? parsed : [item];
                  } catch {
                    return item;
                  }
                }
                return item;
              })
              .flat()
              .filter((item) => typeof item === 'string' && item.trim())
              .map((item) => item.trim());
          }
          if (typeof arr === 'string' && arr.trim()) {
            if (arr.trim().startsWith('[') && arr.trim().endsWith(']')) {
              try {
                const parsed = JSON.parse(arr);
                return Array.isArray(parsed) ? parsed.filter((i) => typeof i === 'string').map((i) => i.trim()) : [];
              } catch {
                return arr.split(',').map((s) => s.trim()).filter(Boolean);
              }
            }
            return arr.split(',').map((s) => s.trim()).filter(Boolean);
          }
          return [];
        };
        
        return {
          ...child,
          likes: normalizeArray(child.likes),
          dislikes: normalizeArray(child.dislikes),
        } as Child;
      });
      
      return normalized;
    },
    enabled: !!user,
  });

  // Создать нового ребенка
  const createChild = useMutation({
    mutationFn: async (childData: Omit<ChildInsert, 'user_id'>) => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('children')
        .insert({
          ...childData,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Child;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children', user?.id] });
    },
  });

  // Обновить ребенка
  const updateChild = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & ChildUpdate) => {
      const { data, error } = await supabase
        .from('children')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Child;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children', user?.id] });
    },
  });

  // Удалить ребенка
  const deleteChild = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('children')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children', user?.id] });
    },
  });

  // Получить одного ребенка по ID
  const getChildById = (id: string) => {
    return useQuery({
      queryKey: ['children', user?.id, id],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('children')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        return data as Child;
      },
      enabled: !!user && !!id,
    });
  };

  // Вычислить возраст ребенка в месяцах
  const calculateAgeInMonths = (birthDate: string): number => {
    const birth = new Date(birthDate);
    const now = new Date();
    
    // Проверяем корректность даты
    if (isNaN(birth.getTime())) {
      console.error('Invalid birth date:', birthDate);
      return 0;
    }
    
    // Вычисляем разницу в годах и месяцах с учетом дня месяца
    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();
    
    // Если день рождения еще не наступил в этом году, вычитаем год
    if (now.getDate() < birth.getDate()) {
      months--;
    }
    
    // Если месяц рождения еще не наступил в этом году, вычитаем месяц
    if (months < 0) {
      months += 12;
      years--;
    }
    
    const totalMonths = years * 12 + months;
    
    return totalMonths;
  };

  // Форматировать возраст для отображения
  const formatAge = (birthDate: string): string => {
    const months = calculateAgeInMonths(birthDate);
    if (months < 12) {
      return `${months} мес`;
    }
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (remainingMonths === 0) {
      return `${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}`;
    }
    return `${years} г. ${remainingMonths} мес`;
  };

  return {
    children,
    isLoading,
    error,
    createChild: createChild.mutateAsync,
    updateChild: updateChild.mutateAsync,
    deleteChild: deleteChild.mutateAsync,
    getChildById,
    calculateAgeInMonths,
    formatAge,
    isCreating: createChild.isPending,
    isUpdating: updateChild.isPending,
    isDeleting: deleteChild.isPending,
  };
}
