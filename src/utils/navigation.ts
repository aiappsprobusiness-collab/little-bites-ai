/** localStorage: пользователь уже видел маркетинговый экран /welcome */
export const HAS_SEEN_WELCOME_KEY = "hasSeenWelcome";

export function shouldShowWelcomePage(): boolean {
  const hasSeenWelcome = localStorage.getItem(HAS_SEEN_WELCOME_KEY);

  const params = new URLSearchParams(window.location.search);

  const hasUTM =
    params.get("utm_source") ||
    params.get("utm_campaign") ||
    params.get("utm_medium");

  return !hasSeenWelcome && !hasUTM;
}
