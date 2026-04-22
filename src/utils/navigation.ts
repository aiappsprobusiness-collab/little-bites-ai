/** localStorage: пользователь уже видел маркетинговый экран /welcome */
export const HAS_SEEN_WELCOME_KEY = "hasSeenWelcome";

export function shouldShowWelcomePage(): boolean {
  return !localStorage.getItem(HAS_SEEN_WELCOME_KEY);
}
