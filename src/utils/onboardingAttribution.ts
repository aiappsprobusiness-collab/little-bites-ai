/**
 * Атрибуция для onboarding: сохраняем query params при первом заходе на welcome/prelogin/share,
 * чтобы передать в аналитику после регистрации.
 */

const STORAGE_KEY = "onboarding_attribution";

export interface OnboardingAttribution {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  entry_point?: string;
  ref?: string;
  shareRef?: string;
  first_landing_path?: string;
  [key: string]: string | undefined;
}

function getUtmAndRefFromSearch(search: string): Partial<OnboardingAttribution> {
  const params = new URLSearchParams(search);
  const get = (k: string) => params.get(k) ?? undefined;
  const out: Partial<OnboardingAttribution> = {};
  const utm_source = get("utm_source");
  const utm_medium = get("utm_medium");
  const utm_campaign = get("utm_campaign");
  const utm_content = get("utm_content");
  const utm_term = get("utm_term");
  if (utm_source) out.source = utm_source;
  if (utm_medium) out.medium = utm_medium;
  if (utm_campaign) out.campaign = utm_campaign;
  if (utm_content) out.content = utm_content;
  if (utm_term) out.term = utm_term;
  const entry_point = get("entry_point") ?? get("ep");
  const ref = get("ref");
  const shareRef = get("shareRef") ?? get("sr");
  if (entry_point) out.entry_point = entry_point;
  if (ref) out.ref = ref;
  if (shareRef) out.shareRef = shareRef;
  return out;
}

/**
 * Прочитать query из location и сохранить в localStorage (onboarding_attribution).
 * Если каких-то параметров нет — не перезатирать существующие ключи; first_landing_path обновляем всегда.
 */
export function saveOnboardingAttribution(pathname: string, search: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const fromUrl = getUtmAndRefFromSearch(search);
    const existing: OnboardingAttribution = (() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const p = JSON.parse(raw) as OnboardingAttribution;
        return p && typeof p === "object" ? p : {};
      } catch {
        return {};
      }
    })();
    const merged: OnboardingAttribution = { ...existing, ...fromUrl };
    merged.first_landing_path = pathname;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
}

export function getOnboardingAttribution(): OnboardingAttribution | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as OnboardingAttribution;
    return p && typeof p === "object" ? p : null;
  } catch {
    return null;
  }
}
