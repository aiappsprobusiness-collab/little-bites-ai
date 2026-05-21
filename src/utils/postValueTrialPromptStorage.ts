/**
 * Один показ trial-предложения после «aha».
 * Модалка — только с экрана плана (не поверх карточки рецепта в чате).
 */

import type { PostValueTrialPromptVariant } from "@/utils/postValueTrialPromptCopy";

const SEEN_KEY_PREFIX = "post_value_trial_prompt_seen:";
const MILESTONE_PLAN_KEY_PREFIX = "post_value_milestone_plan:";
const MILESTONE_CHAT_KEY_PREFIX = "post_value_milestone_chat:";

/** Задержка на экране плана: пользователь успевает увидеть меню, не перекрываем чат. */
export const POST_VALUE_TRIAL_PLAN_PAGE_DELAY_MS = 3_500;

function seenKey(userId: string): string {
  return `${SEEN_KEY_PREFIX}${userId}`;
}

function planMilestoneKey(userId: string): string {
  return `${MILESTONE_PLAN_KEY_PREFIX}${userId}`;
}

function chatMilestoneKey(userId: string): string {
  return `${MILESTONE_CHAT_KEY_PREFIX}${userId}`;
}

export function hasSeenPostValueTrialPrompt(userId: string): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(seenKey(userId)) === "1";
}

export function markPostValueTrialPromptSeen(userId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(seenKey(userId), "1");
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

/** Первое успешное заполнение плана на день (welcome fill или ручное). */
export function recordPostValuePlanMilestone(userId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(planMilestoneKey(userId), "1");
}

/** Первый успешный подбор рецепта в чате — только фиксируем, модалку не открываем. */
export function recordPostValueChatRecipeMilestone(userId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(chatMilestoneKey(userId), "1");
}

export function hasPostValueChatRecipeMilestone(userId: string): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(chatMilestoneKey(userId)) === "1";
}

export function resolvePostValueTrialPromptVariant(userId: string): PostValueTrialPromptVariant {
  return hasPostValueChatRecipeMilestone(userId) ? "plan_and_chat" : "plan_only";
}
