/** Один показ предложения trial после первого «aha» (план или чат). */

const KEY_PREFIX = "post_value_trial_prompt_seen:";

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function hasSeenPostValueTrialPrompt(userId: string): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(key(userId)) === "1";
}

export function markPostValueTrialPromptSeen(userId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key(userId), "1");
}

export function shouldOfferPostValueTrial(params: {
  userId: string | undefined;
  hasAccess: boolean;
  trialUsed: boolean;
}): boolean {
  const { userId, hasAccess, trialUsed } = params;
  if (!userId || hasAccess || trialUsed) return false;
  return !hasSeenPostValueTrialPrompt(userId);
}
