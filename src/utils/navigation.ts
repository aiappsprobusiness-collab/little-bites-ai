/** localStorage: пользователь уже видел маркетинговый экран /welcome */
export const HAS_SEEN_WELCOME_KEY = "hasSeenWelcome";

/**
 * Если `false` — с `/` гостя не ведут на `/welcome`, а сразу на `/auth?mode=signup` (первый визит) или `/auth` (вход, повторный).
 * Прямой маршрут `/welcome` и CTA с других страниц не отключает.
 */
export const WELCOME_PRELOGIN_FROM_ROOT_ENABLED = false;

export function shouldShowWelcomePage(): boolean {
  return !localStorage.getItem(HAS_SEEN_WELCOME_KEY);
}

/** Query для гостя с `/`: первый визит, вкладка «Регистрация» + UTM. */
export function buildRootFirstAuthSearch(currentSearch: string): string {
  const params = new URLSearchParams(currentSearch);
  params.set("mode", "signup");
  return `?${params.toString()}`;
}
