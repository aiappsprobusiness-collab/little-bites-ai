/**
 * Временный компактный debug-блок для диагностики auth/session на Android.
 * Рендерится только в dev-сборке (import.meta.env.DEV).
 */

import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { useSubscription } from "@/hooks/useSubscription";
import {
  getAuthDebugSnapshot,
  type AuthDebugSnapshot,
} from "@/utils/authSessionDebug";

function useDebugSnapshot(): AuthDebugSnapshot | null {
  const { loading, authReady, session, user } = useAuth();
  const { members, isLoading: isLoadingMembers } = useFamily();
  const { isLoading: isLoadingProfile } = useSubscription();

  const profileLoaded = !isLoadingProfile;
  const membersLoaded = !isLoadingMembers;
  const membersCount = members.length;

  const onboardingReason = useMemo(() => {
    if (!authReady) return "auth loading";
    if (!user) return "no user";
    if (isLoadingMembers) return "members loading";
    if (membersCount === 0) return "members empty";
    return null;
  }, [authReady, user, isLoadingMembers, membersCount]);

  const emptyStateReason = useMemo(() => {
    if (!authReady) return "auth loading";
    if (!user) return "no user";
    if (isLoadingMembers) return "members loading";
    if (membersCount === 0) return "members empty";
    return null;
  }, [authReady, user, isLoadingMembers, membersCount]);

  return useMemo(
    () =>
      getAuthDebugSnapshot({
        loading,
        authReady,
        session,
        user,
        membersLoaded,
        membersCount,
        profileLoaded,
        onboardingReason,
        emptyStateReason,
      }),
    [
      loading,
      authReady,
      session,
      user,
      membersLoaded,
      membersCount,
      profileLoaded,
      onboardingReason,
      emptyStateReason,
    ]
  );
}

export function AuthDebugPanel() {
  if (!import.meta.env.DEV) return null;

  const snapshot = useDebugSnapshot();
  if (!snapshot) return null;

  const lines = [
    `auth ready: ${snapshot.authReady ? "yes" : "no"}`,
    `session: ${snapshot.sessionExists ? "yes" : "no"}`,
    `user id: ${snapshot.userId ?? "-"}`,
    `email: ${snapshot.email ?? "-"}`,
    `is PWA: ${snapshot.isPWA ? "yes" : "no"}`,
    `members loaded: ${snapshot.membersLoaded ? "yes" : "no"}`,
    `members count: ${snapshot.membersCount}`,
    `profile loaded: ${snapshot.profileLoaded ? "yes" : "no"}`,
    `onboarding reason: ${snapshot.onboardingReason ?? "-"}`,
    `empty state reason: ${snapshot.emptyStateReason ?? "-"}`,
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] max-h-[40vh] overflow-auto border-t bg-amber-950/95 text-amber-100 text-xs font-mono p-2 shadow-lg"
      style={{ fontSize: "10px" }}
    >
      <div className="font-semibold mb-1 text-amber-200">[DEV] Auth/Session</div>
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}
