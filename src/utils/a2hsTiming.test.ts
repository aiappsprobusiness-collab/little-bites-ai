import { describe, expect, it } from "vitest";
import {
  A2HS_DELAY_AFTER_PLAN_READY_MS,
  A2HS_DELAY_AFTER_RECIPE_MS,
  getA2HSDelayMs,
  PLAN_READY_TOAST_DURATION_MS,
} from "./a2hsTiming";

describe("a2hsTiming", () => {
  it("plan-ready delay is after toast duration", () => {
    expect(A2HS_DELAY_AFTER_PLAN_READY_MS).toBeGreaterThan(PLAN_READY_TOAST_DURATION_MS);
  });

  it("uses longer delay for day/week/plan triggers", () => {
    expect(getA2HSDelayMs("day")).toBe(A2HS_DELAY_AFTER_PLAN_READY_MS);
    expect(getA2HSDelayMs("week")).toBe(A2HS_DELAY_AFTER_PLAN_READY_MS);
    expect(getA2HSDelayMs("plan")).toBe(A2HS_DELAY_AFTER_PLAN_READY_MS);
  });

  it("uses shorter delay for recipe trigger", () => {
    expect(getA2HSDelayMs("recipe")).toBe(A2HS_DELAY_AFTER_RECIPE_MS);
    expect(A2HS_DELAY_AFTER_RECIPE_MS).toBeLessThan(A2HS_DELAY_AFTER_PLAN_READY_MS);
  });
});
