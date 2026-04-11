/**
 * Клиент: те же правила маршрутизации, что на Edge (`resolveRecipeChatIntent` в deepseek-chat),
 * без дублирования ключевых слов. Используется для быстрого ответа без вызова API, fallback при ошибке сети и восстановления UI.
 */

import {
  CHAT_MESSAGE_ASSISTANT_REDIRECT,
  CHAT_MESSAGE_IRRELEVANT,
} from "../../supabase/functions/_shared/chatRecipeRoutingMessages.ts";
import { resolveRecipeChatIntent } from "../../supabase/functions/deepseek-chat/recipeChatIntent.ts";

/**
 * Если запрос явно про тему «Помощь маме» или нерелевантен — возвращает текст сообщения для чата.
 * Иначе null (показывать ответ бэкенда или FAILED_MESSAGE).
 */
export function getRedirectOrIrrelevantMessage(userMessage: string): string | null {
  const meta = getRedirectOrIrrelevantMeta(userMessage);
  return meta?.message ?? null;
}

export type SystemHintRoute = "assistant_topic_redirect" | "assistant_irrelevant" | "curated_under_12_recipe";

export interface RedirectOrIrrelevantMeta {
  message: string;
  route: SystemHintRoute;
  topicKey?: string;
  topicTitle?: string;
  topicShortTitle?: string;
}

/**
 * Сообщение и мета для системной подсказки (редирект / нерелевантность).
 * Логика совпадает с Edge: `recipeChatIntent.ts` + `assistantTopicDetect.ts`.
 */
export function getRedirectOrIrrelevantMeta(userMessage: string): RedirectOrIrrelevantMeta | null {
  const intent = resolveRecipeChatIntent(userMessage);
  if (intent.route === "recipe") {
    return null;
  }
  if (intent.route === "irrelevant") {
    return { message: CHAT_MESSAGE_IRRELEVANT, route: "assistant_irrelevant" };
  }
  if (intent.route === "assistant_topic" && intent.topic?.matched) {
    const t = intent.topic;
    return {
      message: CHAT_MESSAGE_ASSISTANT_REDIRECT,
      route: "assistant_topic_redirect",
      topicKey: t.topicKey,
      topicTitle: t.topicTitle,
      topicShortTitle: t.topicShortTitle,
    };
  }
  return null;
}
