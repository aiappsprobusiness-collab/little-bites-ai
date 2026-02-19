/**
 * Клиентский стор истории консультаций по темам Help.
 * Ключ: memberId + topicKey. Хранилище: localStorage.
 */

const STORAGE_PREFIX = "help_session:";
const MAX_MESSAGES = 12;

export interface TopicSessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string; // ISO
}

function storageKey(memberId: string, topicKey: string): string {
  return `${STORAGE_PREFIX}${memberId}:${topicKey}`;
}

function loadRaw(memberId: string, topicKey: string): TopicSessionMessage[] | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(memberId, topicKey));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const arr = Array.isArray(parsed)
      ? parsed
      : (parsed != null && typeof parsed === "object" && "messages" in parsed && Array.isArray((parsed as { messages: unknown }).messages))
        ? (parsed as { messages: unknown[] }).messages
        : null;
    if (!arr) return null;
    const list = arr.filter(
      (m): m is TopicSessionMessage =>
        m != null &&
        typeof m === "object" &&
        typeof (m as TopicSessionMessage).id === "string" &&
        ((m as TopicSessionMessage).role === "user" || (m as TopicSessionMessage).role === "assistant") &&
        typeof (m as TopicSessionMessage).content === "string" &&
        typeof (m as TopicSessionMessage).timestamp === "string"
    );
    return list;
  } catch {
    return null;
  }
}

function save(memberId: string, topicKey: string, messages: TopicSessionMessage[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    const key = storageKey(memberId, topicKey);
    const toStore = messages.slice(-MAX_MESSAGES);
    localStorage.setItem(
      key,
      JSON.stringify({ messages: toStore, updatedAt: new Date().toISOString() })
    );
  } catch {
    // ignore
  }
}

/** Возвращает сообщения сессии (последние до MAX_MESSAGES) или null. */
export function getSession(
  memberId: string,
  topicKey: string
): TopicSessionMessage[] | null {
  const data = loadRaw(memberId, topicKey);
  if (!data || data.length === 0) return null;
  return data.slice(-MAX_MESSAGES);
}

/** Добавляет сообщение и сохраняет (обрезает до последних MAX_MESSAGES). */
export function upsertMessage(
  memberId: string,
  topicKey: string,
  message: TopicSessionMessage
): TopicSessionMessage[] {
  const current = loadRaw(memberId, topicKey) ?? [];
  const next = [...current, message].slice(-MAX_MESSAGES);
  save(memberId, topicKey, next);
  return next;
}

/** Очищает сессию по memberId и topicKey. */
export function clearSession(memberId: string, topicKey: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(memberId, topicKey));
  } catch {
    // ignore
  }
}
