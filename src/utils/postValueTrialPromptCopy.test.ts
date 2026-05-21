import { describe, expect, it } from "vitest";
import { getPostValueTrialPromptCopy } from "./postValueTrialPromptCopy";

describe("getPostValueTrialPromptCopy", () => {
  it("plan_only mentions menu", () => {
    const copy = getPostValueTrialPromptCopy("plan_only");
    expect(copy.title).toMatch(/Меню/i);
    expect(copy.body).not.toContain("чате");
  });

  it("plan_and_chat mentions both", () => {
    const copy = getPostValueTrialPromptCopy("plan_and_chat");
    expect(copy.body).toMatch(/меню/i);
    expect(copy.body).toMatch(/чате/i);
  });
});
