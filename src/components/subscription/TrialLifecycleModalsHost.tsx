import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppStore } from "@/store/useAppStore";
import { TrialLifecycleModal } from "@/components/subscription/TrialLifecycleModal";
import {
  isPostTrialExpiredNatural,
  isTrialEndingSoon,
  isTrialEndDateSameCalendarDayAs,
} from "@/utils/trialLifecycle";
import {
  hasSeenTrialEndingSoonModal,
  markTrialEndingSoonModalSeen,
  hasSeenTrialExpiredModal,
  markTrialExpiredModalSeen,
} from "@/utils/trialLifecycleStorage";

/**
 * Однократные in-app модалки: конец trial ≤24ч и пост-trial free (без paywall-разметки).
 */
export function TrialLifecycleModalsHost() {
  const { user } = useAuth();
  const showActivated = useAppStore((s) => s.showTrialActivatedModal);
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallReason = useAppStore((s) => s.setPaywallReason);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);

  const { isLoading: isLoadingProfile, trialUntil, trialUsed, hasPremiumAccess } = useSubscription();

  const [phase, setPhase] = useState<"ending_soon" | "expired" | null>(null);

  const endingSoonTitle = useMemo(() => {
    if (!trialUntil) return "Пробный доступ заканчивается завтра";
    return isTrialEndDateSameCalendarDayAs(trialUntil)
      ? "Пробный доступ заканчивается сегодня"
      : "Пробный доступ заканчивается завтра";
  }, [trialUntil]);

  useEffect(() => {
    if (!user?.id || isLoadingProfile) return;

    if (hasPremiumAccess || showActivated) {
      setPhase(null);
      return;
    }

    const uid = user.id;

    if (isPostTrialExpiredNatural(trialUsed, trialUntil, hasPremiumAccess) && !hasSeenTrialExpiredModal(uid)) {
      setPhase("expired");
      return;
    }

    if (isTrialEndingSoon(trialUntil, hasPremiumAccess) && !hasSeenTrialEndingSoonModal(uid)) {
      setPhase("ending_soon");
      return;
    }

    setPhase(null);
  }, [user?.id, isLoadingProfile, showActivated, trialUntil, trialUsed, hasPremiumAccess]);

  const dismissEndingSoon = () => {
    if (user?.id) markTrialEndingSoonModalSeen(user.id);
    setPhase(null);
  };

  const dismissExpired = () => {
    if (user?.id) markTrialExpiredModalSeen(user.id);
    setPhase(null);
  };

  const openPaywall = (reason: "trial_ending_soon" | "trial_expired") => {
    if (user?.id) {
      if (reason === "trial_ending_soon") markTrialEndingSoonModalSeen(user.id);
      else markTrialExpiredModalSeen(user.id);
    }
    setPaywallCustomMessage(null);
    setPaywallReason(reason);
    setShowPaywall(true);
    setPhase(null);
  };

  if (!user || phase == null) return null;

  return (
    <TrialLifecycleModal
      open
      variant={phase}
      endingSoonTitle={endingSoonTitle}
      onPrimary={() => openPaywall(phase === "ending_soon" ? "trial_ending_soon" : "trial_expired")}
      onSecondary={phase === "ending_soon" ? dismissEndingSoon : dismissExpired}
    />
  );
}
