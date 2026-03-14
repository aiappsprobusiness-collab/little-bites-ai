/**
 * Временная диагностика auth/session для отладки проблемы на Android.
 * Используется только в DEV. Не логирует полные токены.
 */

import type { Session, User } from "@supabase/supabase-js";

const PREFIX = "[AuthSession]";

function isPWA(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (nav.standalone === true) ||
    (document.referrer?.includes("android-app://") ?? false)
  );
}

function tokenPreview(accessToken: string | undefined): string {
  if (!accessToken || accessToken.length < 8) return "no";
  return `${accessToken.slice(0, 4)}…${accessToken.slice(-4)}`;
}

export interface AuthDebugSnapshot {
  url: string;
  userAgent: string;
  isPWA: boolean;
  authReady: boolean;
  sessionExists: boolean;
  userId: string | null;
  email: string | null;
  accessTokenExists: boolean;
  membersLoaded: boolean;
  membersCount: number;
  profileLoaded: boolean;
  onboardingReason: string | null;
  emptyStateReason: string | null;
  timestamp: number;
}

let lastSnapshot: AuthDebugSnapshot | null = null;

export function getAuthDebugSnapshot(state: {
  loading: boolean;
  /** Если передан — используется для snapshot.authReady; иначе authReady = !loading */
  authReady?: boolean;
  session: Session | null;
  user: User | null;
  membersLoaded: boolean;
  membersCount: number;
  profileLoaded: boolean;
  onboardingReason: string | null;
  emptyStateReason: string | null;
}): AuthDebugSnapshot {
  const session = state.session;
  const user = state.user;
  const snapshot: AuthDebugSnapshot = {
    url: typeof window !== "undefined" ? window.location.href : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    isPWA: isPWA(),
    authReady: state.authReady ?? !state.loading,
    sessionExists: !!session,
    userId: user?.id ?? null,
    email: user?.email ?? null,
    accessTokenExists: !!(session?.access_token),
    membersLoaded: state.membersLoaded,
    membersCount: state.membersCount,
    profileLoaded: state.profileLoaded,
    onboardingReason: state.onboardingReason,
    emptyStateReason: state.emptyStateReason,
    timestamp: Date.now(),
  };
  lastSnapshot = snapshot;
  return snapshot;
}

/** Логирует в console только в DEV. */
export function logAuthBootstrap(
  source: "getSession" | "onAuthStateChange",
  payload: {
    session: Session | null;
    error?: unknown;
    event?: string;
  }
): void {
  if (!import.meta.env.DEV) return;
  const { session, error, event } = payload;
  const user = session?.user ?? null;
  const tokenPreviewStr = session?.access_token ? tokenPreview(session.access_token) : "no";
  console.log(PREFIX, source, {
    event: event ?? (source === "getSession" ? "initial" : undefined),
    url: typeof window !== "undefined" ? window.location.href : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "",
    isPWA: isPWA(),
    sessionUserId: user?.id ?? null,
    sessionEmail: user?.email ?? null,
    accessToken: tokenPreviewStr,
    hasSession: !!session,
    error: error != null ? String(error) : undefined,
  });
}

/** Логирует результат getSession/getUser (без полного токена). */
export function logAuthSessionResult(
  label: "getSession" | "getUser",
  result: { session?: Session | null; user?: User | null; error?: unknown }
): void {
  if (!import.meta.env.DEV) return;
  const session = "session" in result ? result.session : null;
  const user = "user" in result ? result.user : (session?.user ?? null);
  const tokenPreviewStr = session?.access_token ? tokenPreview(session.access_token) : "no";
  console.log(PREFIX, label, {
    userId: user?.id ?? null,
    email: user?.email ?? null,
    accessTokenExists: !!(session?.access_token),
    tokenPreview: session?.access_token ? tokenPreviewStr : "no",
    error: result.error != null ? String(result.error) : undefined,
  });
}

/** Логирует старт загрузки members/profile. */
export function logMembersProfileLoadStart(
  what: "members" | "profile",
  userId: string | null
): void {
  if (!import.meta.env.DEV) return;
  console.log(PREFIX, `${what} load start`, { userId, url: window.location.href });
}

/** Логирует завершение загрузки members. */
export function logMembersLoadDone(count: number, userId: string | null): void {
  if (!import.meta.env.DEV) return;
  console.log(PREFIX, "members load done", { count, userId });
}

/** Логирует причину показа empty/onboarding. */
export function logEmptyOnboardingReason(
  screen: "chat" | "meal-plan",
  reason: string,
  detail: { isLoadingMembers: boolean; membersCount: number; hasUser: boolean }
): void {
  if (!import.meta.env.DEV) return;
  console.log(PREFIX, "empty/onboarding reason", { screen, reason, ...detail });
}

/** События onAuthStateChange. */
export function logAuthStateChange(event: string, session: Session | null): void {
  if (!import.meta.env.DEV) return;
  const user = session?.user ?? null;
  console.log(PREFIX, "onAuthStateChange", {
    event,
    userId: user?.id ?? null,
    email: user?.email ?? null,
    accessTokenExists: !!(session?.access_token),
  });
}

export function getLastSnapshot(): AuthDebugSnapshot | null {
  return lastSnapshot;
}
