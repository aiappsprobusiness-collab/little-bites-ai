import { describe, expect, it, beforeEach } from "vitest";
import {
  hasSeenPostValueTrialPrompt,
  markPostValueTrialPromptSeen,
  shouldOfferPostValueTrial,
  recordPostValueChatRecipeMilestone,
  resolvePostValueTrialPromptVariant,
} from "./postValueTrialPromptStorage";
import { getPostValueTrialPromptCopy } from "./postValueTrialPromptCopy";

describe("postValueTrialPromptStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("offers trial for free user who has not seen prompt", () => {
    expect(shouldOfferPostValueTrial({ userId: "u1", hasAccess: false, trialUsed: false })).toBe(true);
  });

  it("does not offer when trial used", () => {
    expect(shouldOfferPostValueTrial({ userId: "u1", hasAccess: false, trialUsed: true })).toBe(false);
  });

  it("does not offer after seen", () => {
    markPostValueTrialPromptSeen("u1");
    expect(hasSeenPostValueTrialPrompt("u1")).toBe(true);
    expect(shouldOfferPostValueTrial({ userId: "u1", hasAccess: false, trialUsed: false })).toBe(false);
  });

  it("uses combined variant when chat milestone recorded", () => {
    recordPostValueChatRecipeMilestone("u1");
    expect(resolvePostValueTrialPromptVariant("u1")).toBe("plan_and_chat");
    const copy = getPostValueTrialPromptCopy("plan_and_chat");
    expect(copy.body).toMatch(/меню/i);
    expect(copy.body).toMatch(/чате/i);
  });
});
