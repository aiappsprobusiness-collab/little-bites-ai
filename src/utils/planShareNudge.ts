/** Один раз показать nudge «поделиться меню» после успешного fill дня. */
const PLAN_SHARE_NUDGE_SHOWN_KEY = "mr_plan_share_nudge_shown";

export function shouldShowPlanShareNudge(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(PLAN_SHARE_NUDGE_SHOWN_KEY) !== "1";
}

export function markPlanShareNudgeShown(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PLAN_SHARE_NUDGE_SHOWN_KEY, "1");
  } catch {
    /* ignore */
  }
}
