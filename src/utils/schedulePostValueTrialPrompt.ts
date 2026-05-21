import { useAppStore } from "@/store/useAppStore";
import {
  POST_VALUE_TRIAL_PLAN_PAGE_DELAY_MS,
  recordPostValuePlanMilestone,
  resolvePostValueTrialPromptVariant,
  shouldOfferPostValueTrial,
} from "@/utils/postValueTrialPromptStorage";

let planPagePromptTimer: ReturnType<typeof setTimeout> | null = null;

export function cancelScheduledPostValueTrialPrompt(): void {
  if (planPagePromptTimer != null) {
    clearTimeout(planPagePromptTimer);
    planPagePromptTimer = null;
  }
}

/**
 * Показ trial-предложения только на экране плана, с задержкой после fill.
 * Не вызывать из чата сразу после рецепта.
 */
export function schedulePostValueTrialPromptOnPlanPage(params: {
  userId: string;
  hasAccess: boolean;
  trialUsed: boolean;
}): void {
  cancelScheduledPostValueTrialPrompt();
  const { userId, hasAccess, trialUsed } = params;
  if (!shouldOfferPostValueTrial({ userId, hasAccess, trialUsed })) return;

  recordPostValuePlanMilestone(userId);
  const variant = resolvePostValueTrialPromptVariant(userId);

  planPagePromptTimer = setTimeout(() => {
    planPagePromptTimer = null;
    if (!shouldOfferPostValueTrial({ userId, hasAccess, trialUsed })) return;
    const store = useAppStore.getState();
    if (store.showPaywall || store.showTrialActivatedModal) return;
    store.setPostValueTrialPromptVariant(variant);
    store.setShowPostValueTrialPrompt(true);
  }, POST_VALUE_TRIAL_PLAN_PAGE_DELAY_MS);
}
