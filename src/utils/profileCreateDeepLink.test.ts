import { describe, it, expect } from "vitest";
import { shouldNavigateToCreateProfileForDeepLink } from "./profileCreateDeepLink";

describe("shouldNavigateToCreateProfileForDeepLink", () => {
  const base = {
    hasOpenCreateProfileFlag: true,
    authReady: true,
    isLoading: false,
    membersLen: 0,
    maxProfiles: 4,
  } as const;

  it("навигация при валидном deeplink и пустой семье", () => {
    expect(
      shouldNavigateToCreateProfileForDeepLink({
        ...base,
        suppressAfterMemberCreate: false,
      }),
    ).toBe(true);
  });

  it("не навигирует после создания ребёнка (suppress)", () => {
    expect(
      shouldNavigateToCreateProfileForDeepLink({
        ...base,
        suppressAfterMemberCreate: true,
      }),
    ).toBe(false);
  });

  it("не навигирует если уже есть члены семьи", () => {
    expect(
      shouldNavigateToCreateProfileForDeepLink({
        ...base,
        membersLen: 1,
        suppressAfterMemberCreate: false,
      }),
    ).toBe(false);
  });
});
