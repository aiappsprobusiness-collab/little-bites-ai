import { describe, expect, it } from "vitest";
import {
  FREE_MEAL_SWAP_PER_DAY,
  getSubscriptionLimits,
  SUBSCRIPTION_LIMITS,
} from "./subscriptionRules";

describe("SUBSCRIPTION_LIMITS", () => {
  it("free chat limit is 5", () => {
    expect(SUBSCRIPTION_LIMITS.free.aiDailyLimit).toBe(5);
  });

  it("free help limit is 2", () => {
    expect(SUBSCRIPTION_LIMITS.free.helpDailyLimit).toBe(2);
  });

  it("no helpUnlockedBlocks on config", () => {
    expect("helpUnlockedBlocks" in SUBSCRIPTION_LIMITS.free).toBe(false);
    expect("helpUnlockedBlocks" in SUBSCRIPTION_LIMITS.paid).toBe(false);
  });

  it("paid chat/help limits match product caps", () => {
    expect(SUBSCRIPTION_LIMITS.paid.aiDailyLimit).toBe(20);
    expect(SUBSCRIPTION_LIMITS.paid.helpDailyLimit).toBe(20);
  });
});

describe("FREE_MEAL_SWAP_PER_DAY", () => {
  it("is 2", () => {
    expect(FREE_MEAL_SWAP_PER_DAY).toBe(2);
  });
});

describe("getSubscriptionLimits", () => {
  it("returns free limits for free tier", () => {
    expect(getSubscriptionLimits("free").aiDailyLimit).toBe(5);
  });
});
