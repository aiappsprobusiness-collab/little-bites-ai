/**
 * localStorage-кэш рецептов для снижения Supabase egress.
 * getCachedRecipe проверяет кэш; при промахе — загрузка из Supabase.
 */

const CACHE_PREFIX = 'recipe:';

export interface CachedRecipe {
  data: unknown;
  cachedAt: number;
}

function cacheKey(id: string): string {
  return `${CACHE_PREFIX}${id}`;
}

export function getCachedRecipe<T>(id: string, ttlMs: number = 3600000): T | null {
  if (typeof window === 'undefined' || !id) return null;
  try {
    const raw = localStorage.getItem(cacheKey(id));
    if (!raw) return null;
    const { data, cachedAt } = JSON.parse(raw) as CachedRecipe;
    if (Date.now() - cachedAt > ttlMs) {
      localStorage.removeItem(cacheKey(id));
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

export function setCachedRecipe(id: string, data: unknown): void {
  if (typeof window === 'undefined' || !id) return;
  try {
    const entry: CachedRecipe = { data, cachedAt: Date.now() };
    localStorage.setItem(cacheKey(id), JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

export function invalidateRecipeCache(id: string): void {
  if (typeof window === 'undefined' || !id) return;
  try {
    localStorage.removeItem(cacheKey(id));
  } catch {
    /* ignore */
  }
}
