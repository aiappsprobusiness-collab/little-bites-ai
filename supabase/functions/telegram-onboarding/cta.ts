import type { BuildAuthCtaInput } from "./types.ts";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "blogger_id"] as const;

export function buildAuthSignupUrl(input: BuildAuthCtaInput): string {
  const baseUrl = input.appBaseUrl.replace(/\/$/, "");
  const url = new URL(`${baseUrl}/auth`);
  url.searchParams.set("mode", "signup");
  url.searchParams.set("entry_point", "telegram");
  url.searchParams.set("utm_source", "telegram");

  const utm = input.utm ?? {};
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (!value || typeof value !== "string") continue;
    const safe = value.trim().slice(0, 120);
    if (!safe) continue;
    url.searchParams.set(key, safe);
  }
  return url.toString();
}

/**
 * Финальная CTA после превью меню в Telegram: лайт-страница `/tg-start` (signup без поля имени) + атрибуция для аналитики.
 * Не передаёт ответы анкеты (возраст, аллергии и т.д.) — только параметры из deep-link `/start` (utm_*, blogger_id)
 * и стабильные маркеры канала: `entry_point=telegram`, дефолты `utm_source` / `utm_medium` / `utm_content`, если в ссылке бота их не задали.
 * На фронте `captureAttributionFromLocationOnce()` кладёт это в localStorage; дальше уходит в `usage_events` при событиях.
 */
export function buildTelegramOnboardingFinalAuthUrl(input: BuildAuthCtaInput): string {
  const baseUrl = input.appBaseUrl.replace(/\/$/, "");
  const url = new URL(`${baseUrl}/tg-start`);
  url.searchParams.set("mode", "signup");
  url.searchParams.set("entry_point", "telegram");

  const merged: Record<string, string> = { ...(input.utm ?? {}) };
  const setIfEmpty = (key: (typeof UTM_KEYS)[number], val: string) => {
    const cur = merged[key]?.trim();
    if (!cur) merged[key] = val;
  };
  setIfEmpty("utm_source", "telegram");
  setIfEmpty("utm_medium", "onboarding_bot");
  setIfEmpty("utm_content", "menu_day_final");

  for (const key of UTM_KEYS) {
    const value = merged[key];
    if (!value || typeof value !== "string") continue;
    const safe = value.trim().slice(0, 120);
    if (!safe) continue;
    url.searchParams.set(key, safe);
  }
  return url.toString();
}

/** Публичная страница рецепта (как во фронте `/recipe/:id`). */
export function buildRecipePageUrl(baseUrl: string, recipeId: string, utm: Record<string, string>): string {
  const base = baseUrl.replace(/\/$/, "");
  const url = new URL(`${base}/recipe/${encodeURIComponent(recipeId)}`);
  url.searchParams.set("entry_point", "telegram");
  url.searchParams.set("utm_source", "telegram");
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (!value || typeof value !== "string") continue;
    const safe = value.trim().slice(0, 120);
    if (!safe) continue;
    url.searchParams.set(key, safe);
  }
  return url.toString();
}

/** Публичный тизер рецепта (без авторизации): `/t/:id` — один сегмент пути, без конфликта с `/recipe/:id` (ProtectedRoute). */
export function buildRecipeTeaserPageUrl(baseUrl: string, recipeId: string, utm: Record<string, string>): string {
  const base = baseUrl.replace(/\/$/, "");
  const url = new URL(`${base}/t/${encodeURIComponent(recipeId)}`);
  url.searchParams.set("entry_point", "telegram");
  url.searchParams.set("utm_source", "telegram");
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (!value || typeof value !== "string") continue;
    const safe = value.trim().slice(0, 120);
    if (!safe) continue;
    url.searchParams.set(key, safe);
  }
  return url.toString();
}

/** Веб-воронка превью (карточки как VK), без передачи анкеты в URL — только атрибуция. */
export function buildVkFunnelHandoffUrl(baseUrl: string, utm: Record<string, string>): string {
  const base = baseUrl.replace(/\/$/, "");
  const url = new URL(`${base}/vk`);
  url.searchParams.set("entry_point", "telegram");
  url.searchParams.set("utm_source", "telegram");
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (!value || typeof value !== "string") continue;
    const safe = value.trim().slice(0, 120);
    if (!safe) continue;
    url.searchParams.set(key, safe);
  }
  return url.toString();
}
