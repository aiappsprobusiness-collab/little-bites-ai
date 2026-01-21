import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface UsageData {
  can_generate: boolean;
  remaining: number;
  is_premium: boolean;
  used_today: number;
  daily_limit?: number;
}

export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Получить статус подписки из профиля
  const { data: profile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ['profile-subscription', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('subscription_status')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Получить лимиты использования
  const { data: usageData, isLoading: isLoadingUsage, refetch: refetchUsage } = useQuery({
    queryKey: ['usage-limit', user?.id],
    queryFn: async (): Promise<UsageData | null> => {
      if (!user) return null;
      
      const { data, error } = await supabase.rpc('check_usage_limit', {
        _user_id: user.id,
      });

      if (error) throw error;
      return data as unknown as UsageData;
    },
    enabled: !!user,
    staleTime: 30000, // 30 секунд
  });

  // Увеличить счетчик использования
  const incrementUsage = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      
      const { error } = await supabase.rpc('increment_usage', {
        _user_id: user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-limit', user?.id] });
    },
  });

  // Обновить статус подписки (для RevenueCat webhook)
  const updateSubscriptionStatus = useMutation({
    mutationFn: async (status: 'free' | 'premium' | 'trial') => {
      if (!user) throw new Error('User not authenticated');
      
      const { error } = await supabase
        .from('profiles')
        .update({ subscription_status: status })
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-subscription', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['usage-limit', user?.id] });
    },
  });

  const isPremium = profile?.subscription_status === 'premium';
  const isTrial = profile?.subscription_status === 'trial';
  const canGenerate = usageData?.can_generate ?? true;
  const remaining = usageData?.remaining ?? 5;
  const usedToday = usageData?.used_today ?? 0;
  const dailyLimit = usageData?.daily_limit ?? 5;

  return {
    // Status
    isPremium,
    isTrial,
    subscriptionStatus: profile?.subscription_status || 'free',
    
    // Usage
    canGenerate,
    remaining,
    usedToday,
    dailyLimit,
    
    // Loading
    isLoading: isLoadingProfile || isLoadingUsage,
    
    // Actions
    incrementUsage: incrementUsage.mutateAsync,
    updateSubscriptionStatus: updateSubscriptionStatus.mutateAsync,
    refetchUsage,
  };
}
