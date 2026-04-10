import { describe, it, expect } from "vitest";
import { shouldHandOffEmailAuthToCallback } from "./authEmailLinkParams";

describe("shouldHandOffEmailAuthToCallback", () => {
  it("returns false for stray PKCE code on deep routes (prevents redirect storm)", () => {
    expect(
      shouldHandOffEmailAuthToCallback("/meal-plan", "?code=abc", ""),
    ).toBe(false);
  });

  it("returns true for code on root (PKCE landing)", () => {
    expect(shouldHandOffEmailAuthToCallback("/", "?code=abc", "")).toBe(true);
  });

  it("returns true for tokens in hash", () => {
    expect(
      shouldHandOffEmailAuthToCallback("/meal-plan", "", "#access_token=x&type=recovery"),
    ).toBe(true);
  });
});
