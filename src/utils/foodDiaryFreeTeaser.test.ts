import { describe, expect, it, beforeEach } from "vitest";
import {
  canSendFoodDiaryAsFree,
  hasUsedFoodDiaryFreeSendToday,
  markFoodDiaryFreeSendToday,
} from "./foodDiaryFreeTeaser";

describe("foodDiaryFreeTeaser", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("premium can always send", () => {
    expect(canSendFoodDiaryAsFree(true)).toBe(true);
  });

  it("free can send once per utc day", () => {
    expect(canSendFoodDiaryAsFree(false)).toBe(true);
    markFoodDiaryFreeSendToday();
    expect(hasUsedFoodDiaryFreeSendToday()).toBe(true);
    expect(canSendFoodDiaryAsFree(false)).toBe(false);
  });
});
