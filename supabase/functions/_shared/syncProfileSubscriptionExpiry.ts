import { FREE_AI_DAILY_LIMIT } from "./subscriptionLimits.ts";
import {
  shouldExpirePremiumProfile,
  shouldExpireTrialProfile,
  type ProfileSubscriptionFields,
} from "./subscriptionAccess.ts";

export type ProfileRowWithLimits = ProfileSubscriptionFields & {
  requests_today?: number;
  daily_limit?: number;
};

/** Нужно ли записать free в БД (trial/premium истекли). */
export function needsProfileSubscriptionExpiryWrite(
  profile: ProfileSubscriptionFields | null | undefined,
  userEmail?: string | null,
  nowMs = Date.now()
): boolean {
  if (!profile) return false;
  return (
    shouldExpireTrialProfile(profile, { nowMs }) ||
    shouldExpirePremiumProfile(profile, { userEmail, nowMs })
  );
}

/** Локально привести строку профиля к free после истечения (до/после UPDATE). */
export function applyExpiredProfileFieldsLocal<T extends ProfileRowWithLimits>(
  profile: T,
  userEmail: string | null | undefined,
  nowMs = Date.now()
): T {
  if (shouldExpireTrialProfile(profile, { nowMs })) {
    return { ...profile, status: "free", daily_limit: FREE_AI_DAILY_LIMIT };
  }
  if (shouldExpirePremiumProfile(profile, { userEmail, nowMs })) {
    return { ...profile, status: "free", daily_limit: FREE_AI_DAILY_LIMIT };
  }
  return profile;
}
