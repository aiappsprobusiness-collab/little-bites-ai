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
      return data as Child[];
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
    const years = now.getFullYear() - birth.getFullYear();
    const months = now.getMonth() - birth.getMonth();
    return years * 12 + months;
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
