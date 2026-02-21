/**
 * Debug план (generate-plan): логи [POOL EXCLUDES], [POOL DIAG], [WEEK DONE] в Edge.
 * В PROD всегда выключено. В DEV включается через VITE_DEBUG_PLAN=1 в .env или тумблер (localStorage).
 */

const DEBUG_PLAN_STORAGE_KEY = "debug_plan_enabled";
const DEBUG_PLAN_CONSOLE_KEY = "DEBUG_PLAN";

/** Включён ли дебаг вызовов generate-plan в консоли: payload/response/summary. localStorage DEBUG_PLAN=1 или ?debugPlan=1. */
export function isGeneratePlanDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof localStorage !== "undefined" && localStorage.getItem(DEBUG_PLAN_CONSOLE_KEY) === "1") return true;
  try {
    if (new URLSearchParams(window.location.search).has("debugPlan")) return true;
  } catch {
    // ignore
  }
  if (typeof localStorage !== "undefined" && localStorage.getItem(DEBUG_PLAN_STORAGE_KEY) === "1") return true;
  return false;
}

/** Включён ли debug_plan: только в DEV и (VITE_DEBUG_PLAN=1 или localStorage "debug_plan_enabled"="1"). В PROD всегда false. */
export function isDebugPlanEnabled(): boolean {
  if (import.meta.env.PROD) return false;
  if (import.meta.env.VITE_DEBUG_PLAN === "1") return true;
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(DEBUG_PLAN_STORAGE_KEY) === "1";
}

export function getDebugPlanStorageKey(): string {
  return DEBUG_PLAN_STORAGE_KEY;
}

export function getDebugPlanFromStorage(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(DEBUG_PLAN_STORAGE_KEY) === "1";
}

export function setDebugPlanInStorage(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(DEBUG_PLAN_STORAGE_KEY, enabled ? "1" : "0");
  localStorage.setItem(DEBUG_PLAN_CONSOLE_KEY, enabled ? "1" : "0");
}
