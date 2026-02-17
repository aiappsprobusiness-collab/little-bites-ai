import { useQuery } from '@tanstack/react-query';
import { safeError } from "@/utils/safeLogger";
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { CHAT_HISTORY_SELECT, CHAT_LAST_MESSAGES } from '@/lib/supabase-constants';

/**
 * selectedMemberId: "family" | member_id — контекст чата.
 * family → child_id IS NULL, иначе child_id = selectedMemberId.
 * Загружаем только неархивные (archived_at IS NULL).
 */
export function useChatHistory(selectedMemberId: string | null) {
  const { user } = useAuth();

  const { data: messages = [], isLoading, refetch } = useQuery({
    queryKey: ['chat_history', user?.id, selectedMemberId ?? 'family'],
    queryFn: async () => {
      if (!user) return [];

      let q = supabase
        .from('chat_history')
        .select(CHAT_HISTORY_SELECT)
        .eq('user_id', user.id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(CHAT_LAST_MESSAGES);

      if (selectedMemberId === 'family' || selectedMemberId == null) {
        q = q.is('child_id', null);
      } else {
        q = q.eq('child_id', selectedMemberId);
      }

      const { data, error } = await q;

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

  /** Архивировать чат текущего контекста (скрыть сообщения, не удалять). */
  const archiveChat = async () => {
    if (!user) return;
    let q = supabase
      .from('chat_history')
      .update({ archived_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('archived_at', null);
    if (selectedMemberId === 'family' || selectedMemberId == null) {
      q = q.is('child_id', null);
    } else {
      q = q.eq('child_id', selectedMemberId);
    }
    const { error } = await q;
    if (error) {
      safeError('SYNC ERROR (archive):', error.message, error.details);
      throw error;
    }
    await refetch();
  };

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
    archiveChat,
    deleteMessage,
  };
}
