import { describe, expect, it, vi } from "vitest";
import {
  isFreeSingleAllergyLimitReached,
  openOnboardingSecondAllergyPaywall,
} from "./freeAllergyProfileUi";

describe("isFreeSingleAllergyLimitReached", () => {
  it("false when user has paid access", () => {
    expect(isFreeSingleAllergyLimitReached(true, 0)).toBe(false);
    expect(isFreeSingleAllergyLimitReached(true, 3)).toBe(false);
  });

  it("false on free with zero allergies", () => {
    expect(isFreeSingleAllergyLimitReached(false, 0)).toBe(false);
  });

  it("true on free with one or more allergies", () => {
    expect(isFreeSingleAllergyLimitReached(false, 1)).toBe(true);
    expect(isFreeSingleAllergyLimitReached(false, 2)).toBe(true);
  });
});

describe("openOnboardingSecondAllergyPaywall", () => {
  it("sets reason and opens paywall without custom message", () => {
    const setPaywallReason = vi.fn();
    const setPaywallCustomMessage = vi.fn();
    const setShowPaywall = vi.fn();

    openOnboardingSecondAllergyPaywall({
      setPaywallReason,
      setPaywallCustomMessage,
      setShowPaywall,
    });

    expect(setPaywallReason).toHaveBeenCalledWith("onboarding_second_allergy_free");
    expect(setPaywallCustomMessage).toHaveBeenCalledWith(null);
    expect(setShowPaywall).toHaveBeenCalledWith(true);
  });
});
