import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useSelectedChild } from '@/contexts/SelectedChildContext';
import { useSubscription } from './useSubscription';
import { buildChatContextFromProfiles } from '@/utils/buildChatContextFromProfiles';
import { checkChatAllergyBlock } from '@/utils/chatAllergyCheck';

/** Повтор запроса при сетевой/протокольной ошибке (ERR_HTTP2_PROTOCOL_ERROR, Failed to fetch). */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 1
): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (err) {
    const isNetworkError =
      err instanceof TypeError && (err.message === 'Failed to fetch' || err.message?.includes('fetch')) ||
      (err as Error)?.message?.includes('HTTP2') ||
      (err as Error)?.message?.includes('protocol');
    if (retries > 0 && isNetworkError) {
      await new Promise((r) => setTimeout(r, 1500));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function useDeepSeekAPI() {
  const { user, session } = useAuth();
  const { children, selectedChild, selectedChildId } = useSelectedChild();
  const queryClient = useQueryClient();
  const { canGenerate, refetchUsage } = useSubscription();
  const chatAbortRef = useRef<AbortController | null>(null);

  const abortChat = () => {
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
    }
  };

  // Chat with DeepSeek (streaming: onChunk вызывается на каждом чанке, в конце возвращается полный message)
  const chatMutation = useMutation({
    mutationFn: async ({
      messages,
      type = 'chat',
      overrideSelectedChildId,
      overrideSelectedChild,
      overrideChildren,
      onChunk,
    }: {
      messages: ChatMessage[];
      type?: 'chat' | 'recipe' | 'diet_plan';
      overrideSelectedChildId?: string | null;
      overrideSelectedChild?: typeof selectedChild;
      overrideChildren?: Array<{ id: string; name: string; age_months?: number | null; allergies?: string[]; likes?: string[]; dislikes?: string[] }>;
      onChunk?: (chunk: string) => void;
    }) => {
      // Проверка лимита (для аккаунтов с неограниченным доступом пропускается)
      if (!canGenerate) {
        throw new Error('usage_limit_exceeded');
      }

      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

      // Используем контекст на момент отправки (переданный явно) или из хука
      const currentSelectedChildId = overrideSelectedChildId ?? selectedChildId;
      const currentChildren = overrideChildren ?? children;

      await queryClient.refetchQueries({ queryKey: ['members', user?.id] });
      const freshChildren = (queryClient.getQueryData(['members', user?.id]) as typeof children) ?? currentChildren;
      const freshSelectedChild = currentSelectedChildId && currentSelectedChildId !== 'family'
        ? (freshChildren.find((c) => c.id === currentSelectedChildId) ?? overrideSelectedChild ?? null)
        : freshChildren[0] ?? null;

      const { childData } = buildChatContextFromProfiles({
        userMessage: lastUserMessage,
        children: freshChildren.map((c) => ({ id: c.id, name: c.name, age_months: c.age_months, allergies: c.allergies, likes: c.likes, dislikes: c.dislikes })),
        selectedChild: freshSelectedChild ? { id: freshSelectedChild.id, name: freshSelectedChild.name, age_months: freshSelectedChild.age_months, allergies: freshSelectedChild.allergies, likes: freshSelectedChild.likes, dislikes: freshSelectedChild.dislikes } : null,
        selectedChildId: currentSelectedChildId,
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

      chatAbortRef.current = new AbortController();
      let response: Response;
      try {
        response = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/deepseek-chat`, {
          method: 'POST',
          signal: chatAbortRef.current.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
          },
          body: JSON.stringify({
            messages,
            childData,
            type,
            stream: true,
            maxRecipes: 1,
            targetIsFamily: currentSelectedChildId === 'family',
            ...(currentSelectedChildId === 'family' && freshChildren.length > 0 && {
              allChildren: freshChildren.map((c) => ({
                name: c.name,
                age_months: c.age_months ?? 0,
                allergies: c.allergies ?? [],
                likes: c.likes ?? [],
                dislikes: c.dislikes ?? [],
              })),
            }),
          }),
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? '';
        if (msg.includes('HTTP2') || msg.includes('protocol') || msg === 'Failed to fetch') {
          throw new Error('Соединение прервано. Проверьте интернет и попробуйте ещё раз.');
        }
        throw err;
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (response.status === 429 && error.error === 'usage_limit_exceeded') {
          throw new Error('usage_limit_exceeded');
        }
        throw new Error(error.message || 'Ошибка API');
      }

      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed?.choices?.[0]?.delta?.content;
                if (typeof content === 'string') {
                  fullContent += content;
                  onChunk?.(content);
                }
              } catch {
                // ignore malformed SSE lines
              }
            }
          }
        }

        await refetchUsage();
        return { message: fullContent };
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

      let response: Response;
      try {
        response = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/deepseek-analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
          },
          body: JSON.stringify({ imageBase64, mimeType }),
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? '';
        if (msg.includes('HTTP2') || msg.includes('protocol') || msg === 'Failed to fetch') {
          throw new Error('Соединение прервано. Проверьте интернет и попробуйте ещё раз.');
        }
        throw err;
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
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

  // Save chat to history (без привязки к ребёнку). После вставки — карусель: оставляем только последние 10.
  const CHAT_HISTORY_LIMIT = 10;
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
    abortChat,
    analyze: analyzeMutation.mutateAsync,
    saveChat: saveChatMutation.mutateAsync,
    isChatting: chatMutation.isPending,
    isAnalyzing: analyzeMutation.isPending,
    chatError: chatMutation.error,
    analyzeError: analyzeMutation.error,
  };
}
