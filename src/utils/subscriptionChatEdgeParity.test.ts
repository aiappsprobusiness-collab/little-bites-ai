/**
 * Аудит: логика «платный пользователь» в чате на Edge (deepseek-chat) vs клиент (useSubscription).
 *
 * Клиент выставляет subscriptionStatus = effectiveStatus:
 * - premium, если premium_until > сейчас (и не только если profiles_v2.status === "premium")
 * - trial, если активен trial_until
 *
 * Edge: isPremiumUser = (status === "premium" || status === "trial") — без учёта premium_until.
 * При status "free" и живом premium_until клиент — Premium, Edge — Free → срабатывает slice(0,1) аллергий.
 */
import { describe, expect, it } from "vitest";

/** Как deepseek-chat/index.ts (после загрузки profiles_v2). */
function edgeIsPremiumUser(profile: { status?: string | null }): boolean {
  const subscriptionStatus = profile.status ?? "free";
  return subscriptionStatus === "premium" || subscriptionStatus === "trial";
}

/**
 * Упрощённая модель effectiveStatus из useSubscription:
 * premium при активном premium_until; иначе trial при активном trial_until; иначе free.
 */
function clientEffectiveStatus(profile: {
  status?: string | null;
  premium_until?: string | null;
  trial_until?: string | null;
}): "premium" | "trial" | "free" {
  const now = Date.now();
  const premiumOk =
    profile.premium_until != null &&
    profile.premium_until !== "" &&
    new Date(profile.premium_until).getTime() > now;
  if (premiumOk) return "premium";
  const trialOk =
    profile.trial_until != null &&
    profile.trial_until !== "" &&
    new Date(profile.trial_until).getTime() > now;
  if (trialOk) return "trial";
  return "free";
}

describe("subscriptionChatEdgeParity (аудит аллергий / тариф в чате)", () => {
  it("AUDIT: status=free, premium_until в будущем — клиент premium, Edge free (обрезка аллергий на Edge)", () => {
    const row = {
      status: "free" as const,
      premium_until: "2099-06-01T00:00:00.000Z",
      trial_until: null as string | null,
    };
    expect(clientEffectiveStatus(row)).toBe("premium");
    expect(edgeIsPremiumUser(row)).toBe(false);
  });

  it("AUDIT: status=free, trial_until в будущем — клиент trial, Edge free", () => {
    const row = {
      status: "free" as const,
      premium_until: null as string | null,
      trial_until: "2099-06-01T00:00:00.000Z",
    };
    expect(clientEffectiveStatus(row)).toBe("trial");
    expect(edgeIsPremiumUser(row)).toBe(false);
  });

  it("согласованность: status=premium — и клиент, и Edge платные", () => {
    const row = {
      status: "premium" as const,
      premium_until: "2099-01-01T00:00:00.000Z",
      trial_until: null as string | null,
    };
    expect(clientEffectiveStatus(row)).toBe("premium");
    expect(edgeIsPremiumUser(row)).toBe(true);
  });

  it("согласованность: status=trial и активный trial_until — оба trial", () => {
    const row = {
      status: "trial" as const,
      premium_until: null as string | null,
      trial_until: "2099-01-01T00:00:00.000Z",
    };
    expect(clientEffectiveStatus(row)).toBe("trial");
    expect(edgeIsPremiumUser(row)).toBe(true);
  });
});
