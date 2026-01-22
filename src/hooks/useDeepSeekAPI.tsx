import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useChildren } from './useChildren';
import { useSubscription } from './useSubscription';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChildData {
  name: string;
  ageMonths: number;
  allergies?: string[];
  dietGoals?: string[];
  weight?: number;
  height?: number;
}

const SUPABASE_URL = "https://hidgiyyunigqazssnydm.supabase.co";

export function useDeepSeekAPI() {
  const { user, session } = useAuth();
  const { children, calculateAgeInMonths } = useChildren();
  const { canGenerate, refetchUsage } = useSubscription();
  const queryClient = useQueryClient();
  
  const selectedChild = children[0];

  const getChildData = (): ChildData | undefined => {
    if (!selectedChild) return undefined;
    
    return {
      name: selectedChild.name,
      ageMonths: calculateAgeInMonths(selectedChild.birth_date),
      allergies: selectedChild.allergies || undefined,
      dietGoals: (selectedChild as any).diet_goals || undefined,
      weight: (selectedChild as any).weight || undefined,
      height: (selectedChild as any).height || undefined,
    };
  };

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

      const response = await fetch(`${SUPABASE_URL}/functions/v1/deepseek-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
        body: JSON.stringify({
          messages,
          childData: getChildData(),
          type,
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
