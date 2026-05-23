import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isStandalonePwa } from "./standalone";

describe("isStandalonePwa", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.stubGlobal("navigator", { ...navigator, standalone: undefined });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.unstubAllGlobals();
  });

  it("returns true for display-mode: standalone", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(display-mode: standalone)",
      media: query,
    })) as typeof window.matchMedia;
    expect(isStandalonePwa()).toBe(true);
  });

  it("returns true for iOS navigator.standalone", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, media: "" }) as typeof window.matchMedia;
    vi.stubGlobal("navigator", { ...navigator, standalone: true });
    expect(isStandalonePwa()).toBe(true);
  });

  it("returns false in a normal browser tab", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, media: "" }) as typeof window.matchMedia;
    expect(isStandalonePwa()).toBe(false);
  });
});
