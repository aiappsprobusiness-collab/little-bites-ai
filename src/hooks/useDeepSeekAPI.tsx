import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useFamily } from '@/contexts/FamilyContext';
import { useSubscription } from './useSubscription';
import { buildGenerationContext } from '@/domain/generation/buildGenerationContext';
import { buildPrompt } from '@/domain/generation/buildPrompt';
import { derivePayloadFromContext } from '@/domain/generation/derivePayloadFromContext';
import type { Family, Profile } from '@/domain/generation/types';
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

function toProfile(m: {
  id: string;
  name: string;
  age_months?: number | null;
  allergies?: string[];
  type?: string;
  preferences?: string[];
  difficulty?: string | null;
}): Profile {
  const role = (m.type === 'adult' || m.type === 'family') ? 'adult' : 'child';
  const diff = m.difficulty as Profile['difficulty'] | undefined;
  return {
    id: m.id,
    role,
    name: m.name,
    age: m.age_months != null ? m.age_months / 12 : undefined,
    allergies: m.allergies ?? [],
    preferences: m.preferences ?? [],
    ...(diff && (diff === 'easy' || diff === 'medium' || diff === 'any') && { difficulty: diff }),
  };
}

export function useDeepSeekAPI() {
  const { user, session } = useAuth();
  const { members, selectedMember, selectedMemberId } = useFamily();
  const queryClient = useQueryClient();
  const { canGenerate, refetchUsage, subscriptionStatus } = useSubscription();
  const chatAbortRef = useRef<AbortController | null>(null);
  const plan = (subscriptionStatus === 'premium' || subscriptionStatus === 'trial' || subscriptionStatus === 'free')
    ? subscriptionStatus
    : 'free';

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
      overrideSelectedMemberId,
      overrideSelectedMember,
      overrideMembers,
      onChunk,
    }: {
      messages: ChatMessage[];
      type?: 'chat' | 'recipe' | 'diet_plan';
      overrideSelectedMemberId?: string | null;
      overrideSelectedMember?: typeof selectedMember;
      overrideMembers?: Array<{ id: string; name: string; age_months?: number | null; allergies?: string[] }>;
      onChunk?: (chunk: string) => void;
    }) => {
      if (!canGenerate) {
        throw new Error('usage_limit_exceeded');
      }

      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

      const currentSelectedMemberId = overrideSelectedMemberId ?? selectedMemberId;
      const currentMembers = overrideMembers ?? members;

      await queryClient.refetchQueries({ queryKey: ['members', user?.id] });
      const freshMembers = (queryClient.getQueryData(['members', user?.id]) as typeof members) ?? currentMembers;
      const freshSelectedMember = currentSelectedMemberId && currentSelectedMemberId !== 'family'
        ? (freshMembers.find((c) => c.id === currentSelectedMemberId) ?? overrideSelectedMember ?? null)
        : freshMembers[0] ?? null;

      const activeProfileId: string | 'family' = (currentSelectedMemberId === null || currentSelectedMemberId === 'family')
        ? 'family'
        : currentSelectedMemberId;
      const family: Family = {
        id: 'family',
        profiles: freshMembers.map((c) => toProfile(c)),
        activeProfileId,
      };
      const context = buildGenerationContext(family, family.activeProfileId, plan);
      const { memberData, allMembers, targetIsFamily } = derivePayloadFromContext(context, freshMembers.map((c) => ({
        id: c.id,
        name: c.name,
        age_months: c.age_months,
        allergies: c.allergies,
      })));
      const generationContextBlock = buildPrompt(context, freshMembers.map((c) => ({
        id: c.id,
        name: c.name,
        age_months: c.age_months,
        allergies: c.allergies,
        preferences: c.preferences,
        difficulty: c.difficulty,
      })));

      console.log('AI Context Sent:', {
        memberData,
        ageMonths: memberData?.ageMonths,
        targetIsFamily,
        allergies: memberData?.allergies,
        preferences: memberData?.preferences,
        generationContextBlockLength: generationContextBlock?.length ?? 0,
        generationContextBlockPreview: generationContextBlock ? generationContextBlock.slice(0, 300) : '',
      });

      const allergyCheck = checkChatAllergyBlock(lastUserMessage, memberData?.allergies);
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
            memberData,
            type,
            stream: true,
            maxRecipes: 1,
            targetIsFamily,
            memberId: targetIsFamily ? 'family' : currentSelectedMemberId ?? undefined,
            ...(targetIsFamily && allMembers.length > 0 && { allMembers }),
            ...(generationContextBlock && { generationContextBlock }),
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
