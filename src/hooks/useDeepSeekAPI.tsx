import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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

const SUPABASE_URL = "https://hidgiyyunigqazssnydm.supabase.co";

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

      const { childData } = buildChatContextFromProfiles({
        userMessage: lastUserMessage,
        children,
        selectedChild: selectedChild ?? null,
        selectedChildId,
        calculateAgeInMonths,
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

  // Save chat to history
  const saveChatMutation = useMutation({
    mutationFn: async ({
      message,
      response,
      childId,
      messageType = 'text',
    }: {
      message: string;
      response: string;
      childId?: string;
      messageType?: 'text' | 'image' | 'recipe';
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('chat_history')
        .insert({
          user_id: user.id,
          child_id: childId || null,
          message,
          response,
          message_type: messageType,
        });

      if (error) throw error;
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
