import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useChatHistory(childId?: string) {
  const { user } = useAuth();

  const { data: messages = [], isLoading, refetch } = useQuery({
    queryKey: ['chat_history', user?.id, childId],
    queryFn: async () => {
      if (!user) return [];

      let query = supabase
        .from('chat_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (childId) {
        query = query.eq('child_id', childId);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      
      return data || [];
    },
    enabled: !!user,
  });

  const clearHistory = async () => {
    if (!user) return;
    
    const { error } = await supabase
      .from('chat_history')
      .delete()
      .eq('user_id', user.id);

    if (error) throw error;
    await refetch();
  };

  const deleteMessage = async (messageId: string) => {
    if (!user) return;
    
    const { error } = await supabase
      .from('chat_history')
      .delete()
      .eq('id', messageId)
      .eq('user_id', user.id);

    if (error) throw error;
    await refetch();
  };

  return {
    messages,
    isLoading,
    refetch,
    clearHistory,
    deleteMessage,
  };
}
