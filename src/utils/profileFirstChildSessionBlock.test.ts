import { describe, it, expect, beforeEach } from "vitest";
import {
  setBlockEmptyFamilyProfileAutoOpen,
  clearBlockEmptyFamilyProfileAutoOpenIfHasMembers,
  isBlockingEmptyFamilyProfileAutoOpen,
} from "./profileFirstChildSessionBlock";

describe("profileFirstChildSessionBlock", () => {
  beforeEach(() => {
    try {
      sessionStorage.clear();
    } catch {
      /* */
    }
  });

  it("блокирует до появления членов семьи в контексте", () => {
    expect(isBlockingEmptyFamilyProfileAutoOpen()).toBe(false);
    setBlockEmptyFamilyProfileAutoOpen();
    expect(isBlockingEmptyFamilyProfileAutoOpen()).toBe(true);
    clearBlockEmptyFamilyProfileAutoOpenIfHasMembers(0);
    expect(isBlockingEmptyFamilyProfileAutoOpen()).toBe(true);
    clearBlockEmptyFamilyProfileAutoOpenIfHasMembers(1);
    expect(isBlockingEmptyFamilyProfileAutoOpen()).toBe(false);
  });
});
