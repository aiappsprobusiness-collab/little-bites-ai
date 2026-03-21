/**
 * ~20% запросов: явно добавить в system prompt мягкий блок про likes (остальное время — без этого блока).
 * Детерминированно по requestId + userId + дате. Не счётчик в памяти.
 */

const FAVOR_RATIO = 0.2;

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h);
}

/**
 * Решает, добавлять ли в этом запросе явный текстовый блок про likes (мягкий сигнал).
 * ~20% запросов (детерминировано по requestId + userId + дата).
 */
export function shouldFavorLikes(params: {
  requestId: string;
  userId?: string | null;
  mode?: string;
}): boolean {
  const { requestId, userId = "", mode } = params;
  const dayKey = new Date().toISOString().slice(0, 10);
  const seed = `${requestId}:${userId}:${dayKey}:${mode ?? "chat"}`;
  const hash = simpleHash(seed);
  const normalized = (hash % 1000) / 1000;
  return normalized < FAVOR_RATIO;
}

/**
 * Строка для non-recipe chat path: семья — мягкие симпатии, не обязательная основа блюда.
 */
export function buildLikesLine(likesForPrompt: string[]): string {
  const list = (likesForPrompt ?? []).filter((l) => typeof l === "string" && l.trim()).map((l) => l.trim());
  if (list.length === 0) return "";
  const joined = list.join(", ");
  return `Симпатии семьи (необязательно, не в каждом ответе): ${joined}. Учитывай только иногда и только если уместно; приоритет — разнообразие и запрос пользователя, не «впихивать» эти продукты как главную основу.`;
}

/**
 * То же для одного профиля (non-recipe path).
 */
export function buildLikesLineForProfile(profileName: string, likesForPrompt: string[]): string {
  const list = (likesForPrompt ?? []).filter((l) => typeof l === "string" && l.trim()).map((l) => l.trim());
  if (list.length === 0) return "";
  const joined = list.join(", ");
  const label = (profileName ?? "профиль").trim() || "профиль";
  return `Симпатии (${label}, необязательно): ${joined}. Можно слегка учесть иногда, если уместно; не делай эти продукты обязательной основой каждого блюда — важнее запрос и разнообразие.`;
}
