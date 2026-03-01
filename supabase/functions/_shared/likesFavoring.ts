/**
 * «1 из 5»: в семейной генерации рецептов иногда явно приоритизировать лайки семьи.
 * Детерминированный ~20% на основе requestId + userId + даты, без счётчика в памяти.
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
 * Решает, нужно ли в этом запросе явно добавить в промпт «приоритет лайков семьи».
 * ~20% запросов (детерминировано по requestId + userId + дата), чтобы не прыгало в рамках одного дня.
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
 * Строка для system prompt: «ПРИОРИТЕТ ЛАЙКОВ СЕМЬИ: старайся подобрать рецепт, где ключевые ингредиенты/основа соответствуют лайкам: …»
 */
export function buildLikesLine(likesForPrompt: string[]): string {
  const list = (likesForPrompt ?? []).filter((l) => typeof l === "string" && l.trim()).map((l) => l.trim());
  if (list.length === 0) return "";
  const joined = list.join(", ");
  return `ПРИОРИТЕТ ЛАЙКОВ СЕМЬИ: старайся подобрать рецепт, где ключевые ингредиенты/основа соответствуют лайкам: ${joined}. Это мягкое предпочтение, но постарайся учесть.`;
}
