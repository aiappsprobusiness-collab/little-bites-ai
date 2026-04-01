/** localStorage: однократные trial UX-модалки (ключ на пользователя). */

const ENDING_SOON_PREFIX = "lb_trial_ending_soon_modal_seen:";
const EXPIRED_PREFIX = "lb_trial_expired_modal_seen:";

export function trialEndingSoonSeenKey(userId: string): string {
  return `${ENDING_SOON_PREFIX}${userId}`;
}

export function trialExpiredSeenKey(userId: string): string {
  return `${EXPIRED_PREFIX}${userId}`;
}

export function hasSeenTrialEndingSoonModal(userId: string): boolean {
  try {
    return localStorage.getItem(trialEndingSoonSeenKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markTrialEndingSoonModalSeen(userId: string): void {
  try {
    localStorage.setItem(trialEndingSoonSeenKey(userId), "1");
  } catch {
    // ignore
  }
}

export function hasSeenTrialExpiredModal(userId: string): boolean {
  try {
    return localStorage.getItem(trialExpiredSeenKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markTrialExpiredModalSeen(userId: string): void {
  try {
    localStorage.setItem(trialExpiredSeenKey(userId), "1");
  } catch {
    // ignore
  }
}
