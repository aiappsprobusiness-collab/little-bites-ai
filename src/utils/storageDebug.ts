/**
 * Dev-only логирование: состояние Service Worker, маркер сборки, снимок релевантных ключей storage.
 * Не логирует значения секретов (токены, sb-* показываем только факт наличия ключа).
 */

const PREFIX = "[Storage/SW]";

/** Ключи, по которым показываем только наличие (не значение), чтобы не светить токены. */
const SENSITIVE_KEY_PREFIXES = ["sb-", "auth-token", "token"];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PREFIXES.some((p) => lower.includes(p));
}

/**
 * Логирует состояние Service Worker (active, waiting, installing) и маркер сборки.
 * Вызывать только в DEV.
 */
export function logServiceWorkerState(): void {
  if (!import.meta.env.DEV || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) {
    console.log(PREFIX, "Service Worker not supported");
    return;
  }
  const reg = window.__swRegistration;
  const ctrl = navigator.serviceWorker.controller;
  const state: Record<string, unknown> = {
    build: import.meta.env.PROD ? "production" : "development",
    controller: ctrl ? "present" : "null",
    registration: reg ? "present" : "null",
  };
  if (reg) {
    state.active = reg.active?.state ?? "none";
    state.waiting = reg.waiting?.state ?? "none";
    state.installing = reg.installing?.state ?? "none";
  }
  console.log(PREFIX, "Service Worker state", state);
}

/**
 * Снимок релевантных ключей storage: только имена ключей и «present»/«absent» (без значений).
 * Ключи sb-* и с «token» в имени показываются как «present» без значения.
 */
export function logStorageSnapshot(): void {
  if (!import.meta.env.DEV || typeof localStorage === "undefined") return;
  const keysOfInterest = [
    "selectedMemberId",
    "primaryMemberId",
    "lb_active_session_key",
    "help_chat_messages_v1",
    "chat_hints_seen_v1",
    "onboarding_attribution",
    "child_id",
    "last_child",
    "user_usage_data",
    "recipe_cache",
    "a2hs_attempt_count",
    "a2hs_dismissed_forever",
    "mealPlan_mutedWeekKey",
    "dinner_reminder_enabled",
    "little-bites-app-store",
  ];
  const snapshot: Record<string, string> = {};
  for (const key of keysOfInterest) {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      snapshot[key] = "absent";
    } else if (isSensitiveKey(key)) {
      snapshot[key] = "present";
    } else {
      snapshot[key] = "present";
    }
  }
  const sbKeys = Object.keys(localStorage).filter((k) => k.startsWith("sb-"));
  if (sbKeys.length > 0) {
    snapshot["sb-* keys"] = sbKeys.length.toString();
  }
  console.log(PREFIX, "Storage snapshot (keys)", snapshot);
}

/**
 * Логирует факт очистки legacy-ключей и список удалённых.
 */
export function logLegacyKeysCleared(keys: string[]): void {
  if (!import.meta.env.DEV || keys.length === 0) return;
  console.log(PREFIX, "Legacy keys cleared", keys);
}

/**
 * Одним вызовом: SW state + storage snapshot.
 */
export function logStorageAndSwState(): void {
  logServiceWorkerState();
  logStorageSnapshot();
}
