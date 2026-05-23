import { describe, expect, it, beforeEach, vi } from "vitest";
import { A2HS_EVENT_AFTER_FIRST_DAY } from "@/utils/a2hsTypes";
import {
  A2HS_FIRST_DAY_DISPATCHED_KEY,
  dispatchA2HSFirstDayOnce,
} from "./a2hsEvents";

describe("dispatchA2HSFirstDayOnce", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("dispatches event only once", () => {
    const handler = vi.fn();
    window.addEventListener(A2HS_EVENT_AFTER_FIRST_DAY, handler);

    dispatchA2HSFirstDayOnce();
    dispatchA2HSFirstDayOnce();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(A2HS_FIRST_DAY_DISPATCHED_KEY)).toBe("1");
  });
});
