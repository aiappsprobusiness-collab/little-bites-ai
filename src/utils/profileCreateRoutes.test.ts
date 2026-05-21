import { describe, it, expect } from "vitest";
import {
  PROFILE_CHILD_CREATE_PATH,
  PROFILE_FIRST_CHILD_ONBOARDING,
  buildProfileChildCreateUrl,
} from "./profileCreateRoutes";

describe("profileCreateRoutes", () => {
  it("first child onboarding path", () => {
    expect(PROFILE_FIRST_CHILD_ONBOARDING).toBe("/profile/child/new?welcome=1");
    expect(PROFILE_CHILD_CREATE_PATH).toBe("/profile/child/new");
  });

  it("buildProfileChildCreateUrl", () => {
    expect(buildProfileChildCreateUrl()).toBe("/profile/child/new");
    expect(buildProfileChildCreateUrl({ welcome: true })).toBe("/profile/child/new?welcome=1");
    expect(buildProfileChildCreateUrl({ returnPath: "/chat" })).toBe("/profile/child/new?return=%2Fchat");
  });
});
