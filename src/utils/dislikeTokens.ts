/**
 * Токены для проверки «не любит» в чате (как в recipePool / Edge).
 * Каждый пункт dislikes токенизируется (lower, слова от 2 символов).
 */

function tokenize(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

export function getDislikeTokens(dislikes: string[] | null | undefined): string[] {
  const list = dislikes ?? [];
  const tokens = new Set<string>();
  for (const item of list) {
    const s = String(item).trim().toLowerCase();
    if (!s) continue;
    for (const t of tokenize(s)) tokens.add(t);
  }
  return [...tokens];
}
