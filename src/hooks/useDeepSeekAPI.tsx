import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useChildren } from './useChildren';
import { useSelectedChild } from '@/contexts/SelectedChildContext';
import { useSubscription } from './useSubscription';
import { buildChatContextFromProfiles } from '@/utils/buildChatContextFromProfiles';
import { checkChatAllergyBlock } from '@/utils/chatAllergyCheck';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function useDeepSeekAPI() {
  const { user, session } = useAuth();
  const { children, calculateAgeInMonths } = useChildren();
  const { selectedChild, selectedChildId } = useSelectedChild();
  const { canGenerate, refetchUsage } = useSubscription();
  const queryClient = useQueryClient();

  // Chat with DeepSeek
  const chatMutation = useMutation({
    mutationFn: async ({
      messages,
      type = 'chat',
    }: {
      messages: ChatMessage[];
      type?: 'chat' | 'recipe' | 'diet_plan';
    }) => {
      // Проверка лимита (для аккаунтов с неограниченным доступом пропускается)
      if (!canGenerate) {
        throw new Error('usage_limit_exceeded');
      }

      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

      // Всегда берём свежие данные профиля из БД перед запросом к ИИ (аллергии, любит, не любит)
      await queryClient.refetchQueries({ queryKey: ['children', user?.id] });
      const freshChildren = (queryClient.getQueryData(['children', user?.id]) as typeof children) ?? children;
      const freshSelectedChild = selectedChildId && selectedChildId !== 'family'
        ? freshChildren.find((c) => c.id === selectedChildId)
        : freshChildren[0] ?? null;

      const { childData } = buildChatContextFromProfiles({
        userMessage: lastUserMessage,
        children: freshChildren,
        selectedChild: freshSelectedChild ?? null,
        selectedChildId,
        calculateAgeInMonths,
      });

      console.log('AI Context Sent:', {
        childData,
        allergies: childData?.allergies,
        allergiesStr: childData?.allergies?.length ? `Аллергии ребенка: ${childData.allergies.join(', ')}` : '(не указаны)',
      });

      // Блок по аллергиям: используем те же аллергии, что и в промпте (выбранный / все при «для всех» / matched)
      const allergyCheck = checkChatAllergyBlock(lastUserMessage, childData?.allergies);
      if (allergyCheck.blocked && allergyCheck.found.length > 0) {
        const text = `У нас аллергия на ${allergyCheck.found.join(', ')}, давайте приготовим что-то другое`;
        return { message: text };
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/deepseek-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
        body: JSON.stringify({
          messages,
          childData,
          type,
          stream: false,
          maxRecipes: 1,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 429 && error.error === 'usage_limit_exceeded') {
          throw new Error('usage_limit_exceeded');
        }
        throw new Error(error.message || 'Ошибка API');
      }

      const data = await response.json();
      await refetchUsage();
      return data;
    },
  });

  // Analyze image
  const analyzeMutation = useMutation({
    mutationFn: async ({ imageBase64, mimeType }: { imageBase64: string; mimeType: string }) => {
      if (!canGenerate) {
        throw new Error('usage_limit_exceeded');
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/deepseek-analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
        body: JSON.stringify({ imageBase64, mimeType }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 429) {
          throw new Error('usage_limit_exceeded');
        }
        throw new Error(error.message || 'Ошибка анализа');
      }

      const data = await response.json();
      await refetchUsage();
      return data;
    },
  });

  // Save chat to history (без привязки к ребёнку). После вставки — карусель: оставляем только последние 20.
  const CHAT_HISTORY_LIMIT = 20;
  const saveChatMutation = useMutation({
    mutationFn: async ({
      message,
      response,
      messageType = 'text',
    }: {
      message: string;
      response: string;
      messageType?: 'text' | 'image' | 'recipe';
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { error: insertError } = await supabase
        .from('chat_history')
        .insert({
          user_id: user.id,
          child_id: null,
          message,
          response,
          message_type: messageType,
        });

      if (insertError) {
        console.error('SYNC ERROR:', insertError.message, insertError.details);
        throw insertError;
      }

      // Карусель: удалить самые старые записи, если больше лимита
      const { data: rows } = await supabase
        .from('chat_history')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (rows && rows.length > CHAT_HISTORY_LIMIT) {
        const toDelete = rows.slice(0, rows.length - CHAT_HISTORY_LIMIT).map((r) => r.id);
        const { error: deleteError } = await supabase
          .from('chat_history')
          .delete()
          .in('id', toDelete);
        if (deleteError) console.error('SYNC ERROR (trim history):', deleteError.message, deleteError.details);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat_history'] });
    },
  });

  return {
    chat: chatMutation.mutateAsync,
    analyze: analyzeMutation.mutateAsync,
    saveChat: saveChatMutation.mutateAsync,
    isChatting: chatMutation.isPending,
    isAnalyzing: analyzeMutation.isPending,
    chatError: chatMutation.error,
    analyzeError: analyzeMutation.error,
  };
}
