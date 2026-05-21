/** Контекст воронки paywall для событий в первые 24 ч после регистрации. */

const MS_24H = 86_400_000;

export function getPaywallFunnelContext(userCreatedAt: string | undefined | null): {
  within_first_24h: boolean;
  hours_since_signup: number | null;
} {
  if (!userCreatedAt) {
    return { within_first_24h: false, hours_since_signup: null };
  }
  const createdMs = new Date(userCreatedAt).getTime();
  if (!Number.isFinite(createdMs)) {
    return { within_first_24h: false, hours_since_signup: null };
  }
  const elapsed = Date.now() - createdMs;
  const hours = Math.max(0, elapsed / 3_600_000);
  return {
    within_first_24h: elapsed >= 0 && elapsed < MS_24H,
    hours_since_signup: Math.round(hours * 10) / 10,
  };
}

export function paywallViewProperties(
  paywallReason: string,
  userCreatedAt: string | undefined | null
): Record<string, string | number | boolean> {
  const funnel = getPaywallFunnelContext(userCreatedAt);
  return {
    paywall_reason: paywallReason,
    within_first_24h: funnel.within_first_24h,
    ...(funnel.hours_since_signup != null ? { hours_since_signup: funnel.hours_since_signup } : {}),
  };
}
