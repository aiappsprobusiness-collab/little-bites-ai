import { describe, expect, it } from "vitest";
import {
  resolveEffectiveSubscription,
  shouldExpirePremiumProfile,
  shouldExpireTrialProfile,
  UNLIMITED_ACCESS_EMAILS,
} from "./subscriptionAccess";

const PAST = "2020-01-01T00:00:00.000Z";
const FUTURE = "2099-06-01T00:00:00.000Z";
const NOW = new Date("2026-05-23T12:00:00.000Z").getTime();

describe("subscriptionAccess", () => {
  it("whitelist email stays premium when premium_until expired", () => {
    const email = UNLIMITED_ACCESS_EMAILS[0];
    expect(
      resolveEffectiveSubscription(
        { status: "premium", premium_until: PAST, email },
        { nowMs: NOW }
      )
    ).toBe("premium");
    expect(
      shouldExpirePremiumProfile(
        { status: "premium", premium_until: PAST, email },
        { nowMs: NOW }
      )
    ).toBe(false);
  });

  it("expired premium_until → effective free and should expire DB row", () => {
    const row = { status: "premium" as const, premium_until: PAST, email: "user@example.com" };
    expect(resolveEffectiveSubscription(row, { nowMs: NOW })).toBe("free");
    expect(shouldExpirePremiumProfile(row, { nowMs: NOW })).toBe(true);
  });

  it("status premium without premium_until is not auto-expired", () => {
    const row = { status: "premium" as const, premium_until: null, email: "user@example.com" };
    expect(shouldExpirePremiumProfile(row, { nowMs: NOW })).toBe(false);
    expect(resolveEffectiveSubscription(row, { nowMs: NOW })).toBe("free");
  });

  it("active premium_until → premium", () => {
    expect(
      resolveEffectiveSubscription({ status: "free", premium_until: FUTURE }, { nowMs: NOW })
    ).toBe("premium");
  });

  it("expired trial should expire", () => {
    const row = { status: "trial" as const, trial_until: PAST };
    expect(resolveEffectiveSubscription(row, { nowMs: NOW })).toBe("free");
    expect(shouldExpireTrialProfile(row, { nowMs: NOW })).toBe(true);
  });
});
