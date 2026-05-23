/**
 * Паритет тарифа: клиент и Edge используют resolveEffectiveSubscription (premium_until / trial_until / whitelist).
 */
import { describe, expect, it } from "vitest";
import {
  isPremiumOrTrialTier,
  resolveEffectiveSubscription,
} from "./subscriptionAccess";

function edgeIsPremiumUser(profile: {
  status?: string | null;
  premium_until?: string | null;
  trial_until?: string | null;
  email?: string | null;
}): boolean {
  return isPremiumOrTrialTier(resolveEffectiveSubscription(profile));
}

const FUTURE = "2099-06-01T00:00:00.000Z";
const PAST = "2020-01-01T00:00:00.000Z";
const NOW = new Date("2026-05-23T12:00:00.000Z").getTime();

describe("subscriptionChatEdgeParity", () => {
  it("status=free, premium_until в будущем — клиент и Edge premium", () => {
    const row = {
      status: "free" as const,
      premium_until: FUTURE,
      trial_until: null as string | null,
    };
    expect(resolveEffectiveSubscription(row, { nowMs: NOW })).toBe("premium");
    expect(edgeIsPremiumUser(row)).toBe(true);
  });

  it("status=premium, premium_until истёк — оба free", () => {
    const row = {
      status: "premium" as const,
      premium_until: PAST,
      trial_until: null as string | null,
      email: "user@example.com",
    };
    expect(resolveEffectiveSubscription(row, { nowMs: NOW })).toBe("free");
    expect(edgeIsPremiumUser(row)).toBe(false);
  });

  it("status=free, trial_until в будущем — оба trial", () => {
    const row = {
      status: "free" as const,
      premium_until: null as string | null,
      trial_until: FUTURE,
    };
    expect(resolveEffectiveSubscription(row, { nowMs: NOW })).toBe("trial");
    expect(edgeIsPremiumUser(row)).toBe(true);
  });

  it("status=premium и активный premium_until — оба premium", () => {
    const row = {
      status: "premium" as const,
      premium_until: FUTURE,
      trial_until: null as string | null,
    };
    expect(resolveEffectiveSubscription(row, { nowMs: NOW })).toBe("premium");
    expect(edgeIsPremiumUser(row)).toBe(true);
  });

  it("status=trial и активный trial_until — оба trial", () => {
    const row = {
      status: "trial" as const,
      premium_until: null as string | null,
      trial_until: FUTURE,
    };
    expect(resolveEffectiveSubscription(row, { nowMs: NOW })).toBe("trial");
    expect(edgeIsPremiumUser(row)).toBe(true);
  });
});
