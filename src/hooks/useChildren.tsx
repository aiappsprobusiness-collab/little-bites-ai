import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type Child = Tables<'children'>;
type ChildInsert = TablesInsert<'children'>;
type ChildUpdate = TablesUpdate<'children'>;

/** Привести значение к text[] (схема children). Без дублей и пустых строк. */
function ensureStringArray(v: unknown): string[] {
  let arr: string[] = [];
  if (Array.isArray(v)) {
    arr = v.map((x) => (typeof x === 'string' ? x.trim() : String(x))).filter(Boolean);
  } else if (typeof v === 'string' && v.trim()) {
    arr = v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [...new Set(arr)];
}

/** Нормализовать payload для insert/update. Схема children: только name, birth_date, allergies, likes, dislikes (все массивы — text[]). */
function normalizeChildPayload<T extends Record<string, unknown>>(payload: T): T {
  const out = { ...payload };
  const arrayKeys = ['allergies', 'dislikes', 'likes'] as const;
  for (const key of arrayKeys) {
    if (key in out && out[key] !== undefined) {
      (out as Record<string, unknown>)[key] = ensureStringArray(out[key]);
    }
  }
  if ('birth_date' in out && typeof out.birth_date === 'string') {
    const d = out.birth_date.trim();
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) (out as Record<string, unknown>).birth_date = d;
  }
  return out;
}

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
          allergies: normalizeArray(child.allergies),
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

      const payload = normalizeChildPayload({
        ...childData,
        user_id: user.id,
      } as Record<string, unknown>) as ChildInsert;

      const { data, error } = await supabase
        .from('children')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('Supabase Error Details:', error.message, error.details, error.hint);
        alert(`Ошибка сохранения: ${error.message}`);
        throw error;
      }
      return data as Child;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children', user?.id] });
    },
  });

  const childrenQueryKey = ['children', user?.id] as const;

  // Обновить ребенка: id не попадает в тело update — только в .eq('id', id). Оптимистичное обновление кэша.
  const updateChild = useMutation({
    mutationFn: async (payload: { id: string } & ChildUpdate) => {
      const { id, ...rest } = payload;
      if (!id || typeof id !== 'string') {
        const err = new Error('childId must be a valid UUID');
        console.error(err.message);
        throw err;
      }
      const normalized = normalizeChildPayload(rest as Record<string, unknown>) as Record<string, unknown>;
      const { id: _, ...updateData } = normalized;

      const { data, error } = await supabase
        .from('children')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('SYNC ERROR:', error.message);
        throw error;
      }
      return data as Child;
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: childrenQueryKey });
      const previousChildren = queryClient.getQueryData(childrenQueryKey);
      queryClient.setQueryData(childrenQueryKey, (old: Child[] | undefined) =>
        (old ?? []).map((c) => (c.id === payload.id ? { ...c, ...payload } : c))
      );
      return { previousChildren };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousChildren != null) {
        queryClient.setQueryData(childrenQueryKey, context.previousChildren);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['children'] });
    },
  });

  // Удалить ребенка
  const deleteChild = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('children')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('SYNC ERROR:', error.message, error.details);
        throw error;
      }
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

  // Форматировать возраст для отображения. До 3 лет всегда показываем месяцы (2 г. 5 мес.), чтобы было видно сохранение.
  const formatAge = (birthDate: string): string => {
    const months = calculateAgeInMonths(birthDate);
    if (months < 12) {
      return `${months} мес`;
    }
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (years < 3) {
      return `${years} г. ${remainingMonths} мес`;
    }
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
