/**
 * Логика мягкого сигнала likes в deepseek-chat: детект повторов любимого продукта
 * в недавних названиях рецептов (title keys из chat_history).
 */

export type DetectRepeatedLikesOptions = {
  /** Сколько последних уникальных title key проверять (порядок: новее раньше). */
  window?: number;
};

/** Согласовано с normalizeTitleKey в deepseek-chat/index.ts (anti-duplicate). */
export function normalizeKeyForLikesMatch(text: string): string {
  return (text ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleWords(titleNorm: string): string[] {
  return titleNorm.split(/\s+/).filter(Boolean);
}

/**
 * Совпадение like с title key: точная подстрока, склонения (префикс слова), короткие лайки — по словам.
 */
export function likeMatchesTitleKey(likeRaw: string, titleKeyNorm: string): boolean {
  const likeNorm = normalizeKeyForLikesMatch(likeRaw);
  if (!likeNorm || !titleKeyNorm) return false;
  if (titleKeyNorm.includes(likeNorm)) return true;
  const words = titleWords(titleKeyNorm);
  if (likeNorm.length <= 3) {
    return words.some((w) => w === likeNorm || w.startsWith(likeNorm));
  }
  const stemLen = Math.min(likeNorm.length, 5);
  const stem = likeNorm.slice(0, stemLen);
  if (stem.length >= 4 && titleKeyNorm.includes(stem)) return true;
  return words.some((w) => w.startsWith(stem) || w.includes(likeNorm) || likeNorm.includes(w));
}

/**
 * Какие из likes уже «засветились» в последних window названиях (главная эвристика — по title).
 */
export function detectRepeatedLikesInRecentTitles(
  likes: string[],
  recentTitleKeys: string[],
  options?: DetectRepeatedLikesOptions
): { repeatedLikes: string[]; windowTitles: string[] } {
  const window = options?.window ?? 3;
  const windowTitles = (recentTitleKeys ?? []).slice(0, Math.max(0, window));
  if (windowTitles.length === 0 || !likes?.length) {
    return { repeatedLikes: [], windowTitles };
  }
  const normalizedTitles = windowTitles.map((t) => normalizeKeyForLikesMatch(t)).filter(Boolean);
  const seen = new Set<string>();
  const repeatedLikes: string[] = [];
  for (const raw of likes) {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (!trimmed) continue;
    for (const titleNorm of normalizedTitles) {
      if (likeMatchesTitleKey(trimmed, titleNorm)) {
        if (!seen.has(trimmed)) {
          seen.add(trimmed);
          repeatedLikes.push(trimmed);
        }
        break;
      }
    }
  }
  return { repeatedLikes, windowTitles };
}

/** Явный запрет повторять недавнюю «базу» из liked ingredients. */
export function buildLikesAntiRepeatPromptLine(repeatedLikes: string[]): string {
  const list = (repeatedLikes ?? []).filter(Boolean);
  if (list.length === 0) return "";
  const j = list.join(", ");
  return `[РАЗНООБРАЗИЕ — НЕДАВНИЕ ЛАЙКИ]
В последних сгенерированных блюдах уже был акцент на: ${j}.
В этом рецепте НЕ делай эти продукты главной основой блюда (не «центральным белком/героем» тарелки). Выбери другую уместную основу. Это важнее, чем снова использовать лайки из профиля.`;
}

/** Мягкий блок для recipe-path (добавляется только при favor-roll и без недавнего повтора). */
export function buildRecipeSoftLikesPromptBlock(joinedLikes: string, isFamily: boolean): string {
  const scope = isFamily ? "семьи" : "профиля";
  return `[ПРЕДПОЧТЕНИЯ ${scope} (мягкий сигнал, НЕ обязательно)]
В профиле отмечены вкусовые симпатии: ${joinedLikes}.
Это необязательное пожелание: можно слегка учесть, только если это уместно запросу пользователя, возрасту и ограничениям.
НЕ включай эти продукты в каждый рецепт и не делай их обязательной основой блюда.
Приоритет: соответствие тексту запроса пользователя, безопасность, разнообразие белков и основ.`;
}
