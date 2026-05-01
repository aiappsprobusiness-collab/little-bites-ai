import { describe, it, expect } from "vitest";
import { shouldOpenSheetForOpenCreateProfileDeepLink } from "./profileSheetDeepLink";

/**
 * Регресс: после создания первого ребёнка `suppressEmptyFamilyAutoOpenRef` = true, но
 * query `openCreateProfile=1` мог остаться на один кадр — второй useEffect на ProfilePage
 * снова открывал шторку, если не проверять suppress (и не чистить URL).
 */
describe("shouldOpenSheetForOpenCreateProfileDeepLink", () => {
  const base = {
    hasOpenCreateProfileFlag: true,
    authReady: true,
    isLoading: false,
    membersLen: 0,
    maxProfiles: 4,
  } as const;

  it("открывает шторку при валидном deeplink и пустой семье", () => {
    expect(
      shouldOpenSheetForOpenCreateProfileDeepLink({
        ...base,
        suppressAfterMemberCreate: false,
      })
    ).toBe(true);
  });

  it("НЕ открывает после создания ребёнка (suppress), даже если query ещё «1»", () => {
    expect(
      shouldOpenSheetForOpenCreateProfileDeepLink({
        ...base,
        suppressAfterMemberCreate: true,
      })
    ).toBe(false);
  });

  it("не открывает если уже есть члены семьи", () => {
    expect(
      shouldOpenSheetForOpenCreateProfileDeepLink({
        ...base,
        membersLen: 1,
        suppressAfterMemberCreate: false,
      })
    ).toBe(false);
  });

  it("не открывает без флага в query", () => {
    expect(
      shouldOpenSheetForOpenCreateProfileDeepLink({
        ...base,
        hasOpenCreateProfileFlag: false,
        suppressAfterMemberCreate: false,
      })
    ).toBe(false);
  });
});
