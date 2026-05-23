import { A2HS_EVENT_AFTER_FIRST_DAY, A2HS_EVENT_AFTER_FIRST_WEEK } from "@/utils/a2hsTypes";

export const A2HS_FIRST_DAY_DISPATCHED_KEY = "a2hs_first_day_dispatched";
export const A2HS_FIRST_WEEK_DISPATCHED_KEY = "a2hs_first_week_dispatched";

export function dispatchA2HSFirstDayOnce(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(A2HS_FIRST_DAY_DISPATCHED_KEY) === "1") return;
  localStorage.setItem(A2HS_FIRST_DAY_DISPATCHED_KEY, "1");
  window.dispatchEvent(new CustomEvent(A2HS_EVENT_AFTER_FIRST_DAY));
}

export function dispatchA2HSFirstWeekOnce(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(A2HS_FIRST_WEEK_DISPATCHED_KEY) === "1") return;
  localStorage.setItem(A2HS_FIRST_WEEK_DISPATCHED_KEY, "1");
  window.dispatchEvent(new CustomEvent(A2HS_EVENT_AFTER_FIRST_WEEK));
}
