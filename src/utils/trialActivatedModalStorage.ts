/** localStorage: один раз показать TrialActivatedModal после активации trial (ключ на пользователя). */

const KEY_PREFIX = "lb_trial_activated_modal_seen:";

export function trialActivatedModalSeenKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function hasSeenTrialActivatedModal(userId: string): boolean {
  try {
    return localStorage.getItem(trialActivatedModalSeenKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markTrialActivatedModalSeen(userId: string): void {
  try {
    localStorage.setItem(trialActivatedModalSeenKey(userId), "1");
  } catch {
    // квота / приватный режим — игнорируем
  }
}
