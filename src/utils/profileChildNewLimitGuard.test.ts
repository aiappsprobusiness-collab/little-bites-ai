import { describe, expect, it } from "vitest";
import { shouldEnforceNewProfileMemberLimit } from "./profileChildNewLimitGuard";

describe("shouldEnforceNewProfileMemberLimit", () => {
  it("не блокирует после успешного сохранения первого профиля", () => {
    expect(
      shouldEnforceNewProfileMemberLimit({
        isNewRoute: true,
        membersLen: 1,
        maxProfiles: 1,
        skipAfterSuccessfulSave: true,
      }),
    ).toBe(false);
  });

  it("блокирует вход на /new при уже полной семье на Free", () => {
    expect(
      shouldEnforceNewProfileMemberLimit({
        isNewRoute: true,
        membersLen: 1,
        maxProfiles: 1,
        skipAfterSuccessfulSave: false,
      }),
    ).toBe(true);
  });

  it("не блокирует пока семья пустая", () => {
    expect(
      shouldEnforceNewProfileMemberLimit({
        isNewRoute: true,
        membersLen: 0,
        maxProfiles: 1,
        skipAfterSuccessfulSave: false,
      }),
    ).toBe(false);
  });
});
