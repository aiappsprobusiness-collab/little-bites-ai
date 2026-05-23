/**
 * Единая модель доступа: effective tier, истечение premium/trial, внутренний whitelist.
 * Зеркало для Edge: `supabase/functions/_shared/subscriptionAccess.ts`.
 */

export const UNLIMITED_ACCESS_EMAILS = ["alesah007@gmail.com"] as const;

export type EffectiveSubscriptionTier = "free" | "trial" | "premium";

export interface ProfileSubscriptionFields {
  status?: string | null;
  premium_until?: string | null;
  trial_until?: string | null;
  email?: string | null;
}

export function isUnlimitedAccessEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (UNLIMITED_ACCESS_EMAILS as readonly string[]).includes(normalized);
}

export function isTimestampActive(until: string | null | undefined, nowMs = Date.now()): boolean {
  if (until == null || until === "") return false;
  const t = new Date(until).getTime();
  return Number.isFinite(t) && t > nowMs;
}

/** Платный premium: только premium_until > now (не полагаемся на status в БД). */
export function hasActivePremiumUntil(
  profile: ProfileSubscriptionFields | null | undefined,
  nowMs = Date.now()
): boolean {
  return isTimestampActive(profile?.premium_until ?? null, nowMs);
}

/** Активный trial по trial_until. */
export function hasActiveTrialUntil(
  profile: ProfileSubscriptionFields | null | undefined,
  nowMs = Date.now()
): boolean {
  return isTimestampActive(profile?.trial_until ?? null, nowMs);
}

/**
 * Эффективный тариф для гейтов UI и Edge (после синхронизации профиля).
 * Whitelist → premium. Иначе premium_until, затем trial_until, иначе free.
 */
export function resolveEffectiveSubscription(
  profile: ProfileSubscriptionFields | null | undefined,
  options?: { userEmail?: string | null; nowMs?: number }
): EffectiveSubscriptionTier {
  const nowMs = options?.nowMs ?? Date.now();
  const email = options?.userEmail ?? profile?.email ?? null;
  if (isUnlimitedAccessEmail(email)) return "premium";
  if (hasActivePremiumUntil(profile, nowMs)) return "premium";
  if (hasActiveTrialUntil(profile, nowMs)) return "trial";
  return "free";
}

export function isPremiumOrTrialTier(tier: EffectiveSubscriptionTier): boolean {
  return tier === "premium" || tier === "trial";
}

/** Сбросить status premium → free в БД (не для whitelist; без premium_until не трогаем). */
export function shouldExpirePremiumProfile(
  profile: ProfileSubscriptionFields | null | undefined,
  options?: { userEmail?: string | null; nowMs?: number }
): boolean {
  if (!profile || profile.status !== "premium") return false;
  const email = options?.userEmail ?? profile?.email ?? null;
  if (isUnlimitedAccessEmail(email)) return false;
  if (profile.premium_until == null || profile.premium_until === "") return false;
  return !hasActivePremiumUntil(profile, options?.nowMs);
}

/** Сбросить status trial → free в БД. */
export function shouldExpireTrialProfile(
  profile: ProfileSubscriptionFields | null | undefined,
  options?: { nowMs?: number }
): boolean {
  if (!profile || profile.status !== "trial") return false;
  if (profile.trial_until == null || profile.trial_until === "") return false;
  return !hasActiveTrialUntil(profile, options?.nowMs);
}
