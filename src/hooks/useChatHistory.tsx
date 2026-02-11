import { useQuery } from '@tanstack/react-query';
import { safeError } from "@/utils/safeLogger";
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { CHAT_HISTORY_SELECT, CHAT_LAST_MESSAGES } from '@/lib/supabase-constants';

/** История чата без привязки к ребёнку: только user_id. Лимит — последние 10 записей. */
export function useChatHistory() {
  const { user } = useAuth();

  const { data: messages = [], isLoading, refetch } = useQuery({
    queryKey: ['chat_history', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('chat_history')
        .select(CHAT_HISTORY_SELECT)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(CHAT_LAST_MESSAGES);

      if (error) {
        safeError('SYNC ERROR:', error.message, error.details);
        throw error;
      }
      const list = (data ?? []).slice();
      list.reverse();
      return list;
    },
    enabled: !!user,
  });

  const clearHistory = async () => {
    if (!user) return;
    const { error } = await supabase.from('chat_history').delete().eq('user_id', user.id);
    if (error) {
      safeError('SYNC ERROR:', error.message, error.details);
      throw error;
    }
    await refetch();
  };

  const deleteMessage = async (messageId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('chat_history')
      .delete()
      .eq('id', messageId)
      .eq('user_id', user.id);
    if (error) {
      safeError('SYNC ERROR:', error.message, error.details);
      throw error;
    }
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
