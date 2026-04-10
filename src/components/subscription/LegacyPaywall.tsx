import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Crown, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { trackUsageEvent } from "@/utils/usageEvents";
import { trackPaywallTextShown } from "@/utils/paywallTextAnalytics";
import { getPaywallReasonCopy, resolvePaywallReason } from "@/utils/paywallReasonCopy";
import { cn } from "@/lib/utils";
import { TRIAL_DURATION_DAYS } from "@/utils/subscriptionRules";
import { PaywallLegalConsentNote } from "@/components/legal/PaywallLegalConsentNote";
import { PaywallSubscriptionPlans } from "@/components/subscription/PaywallSubscriptionPlans";
import { paywallSubscribeCtaLabel } from "@/utils/subscriptionPricing";
import {
  PAYWALL_HERO_ICON_CLASS,
  PAYWALL_HERO_ICON_WRAP,
  PAYWALL_MODAL_BOTTOM_PANEL,
  PAYWALL_MODAL_CARD,
  PAYWALL_MODAL_SCROLL_TINT,
  PAYWALL_OUTLINE_PAY_CTA,
  PAYWALL_OVERLAY,
  PAYWALL_PLANS_CONTAINER,
  PAYWALL_PRIMARY_CTA,
} from "@/utils/paywallBrandStyles";
import { PAYWALL_TRIAL_ACTIVE_HINT, PAYWALL_TRIAL_ALREADY_USED } from "@/utils/unifiedPaywallCopy";

export interface PaywallSharedProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribe?: () => void;
}

function trialFreeShortLine(days: number): string {
  if (days === 1) return "1 день бесплатно";
  if (days >= 2 && days <= 4) return `${days} дня бесплатно`;
  return `${days} дней бесплатно`;
}

/**
 * Контекстный paywall по `paywall_reason` (legacy).
 * По умолчанию приложение использует `UnifiedPaywall`; этот компонент — fallback при `VITE_FF_UNIFIED_PAYWALL=false`.
 */
export function LegacyPaywall({ isOpen, onClose, onSubscribe }: PaywallSharedProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const paywallCustomMessage = useAppStore((s) => s.paywallCustomMessage);
  const {
    startPayment,
    isStartingPayment,
    isPremium,
    hasAccess,
    hasTrialAccess,
    trialRemainingDays,
    trialUsed,
    startTrial,
    isStartingTrial,
  } = useSubscription();
  const [pricingOption, setPricingOption] = useState<"month" | "year">("year");
  const paywallReason = useAppStore((s) => s.paywallReason);
  const resolvedReason = resolvePaywallReason(paywallReason);
  const isOnboardingSecondAllergy = resolvedReason === "onboarding_second_allergy_free";
  const showPayForm = !hasAccess || hasTrialAccess;
  const trialUnavailable = trialUsed && !hasTrialAccess;

  const copy = useMemo(() => getPaywallReasonCopy(paywallReason), [paywallReason]);

  useEffect(() => {
    if (isOpen) {
      trackUsageEvent("paywall_view", {
        properties: { paywall_reason: resolvedReason },
      });
      trackPaywallTextShown(resolvedReason, { surface: "legacy_paywall" });
    }
  }, [isOpen, paywallReason, paywallCustomMessage, resolvedReason, isOnboardingSecondAllergy]);

  const handleStartTrial = async () => {
    trackUsageEvent("paywall_primary_click");
    try {
      await startTrial();
      trackUsageEvent("trial_started");
      onSubscribe?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "TRIAL_ALREADY_USED") {
        toast({ variant: "default", title: PAYWALL_TRIAL_ALREADY_USED, description: "Оформите полную версию для полного доступа." });
      } else {
        toast({ variant: "destructive", title: "Ошибка", description: msg || "Попробуйте позже." });
      }
    }
  };

  const handlePayPremium = () => {
    startPayment(pricingOption).catch((err) => {
      toast({ variant: "destructive", title: "Ошибка оплаты", description: err?.message || "Попробуйте позже." });
    });
  };

  const handleContinueFree = () => {
    trackUsageEvent("paywall_secondary_click");
    onClose();
  };

  const handleManageSubscription = () => {
    onClose();
    navigate("/subscription/manage");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            "fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4",
            PAYWALL_OVERLAY,
          )}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className={cn(
              "w-full max-w-md max-h-[100dvh] sm:max-h-[min(100dvh,800px)] min-h-[68dvh] sm:min-h-0 flex flex-col overflow-hidden px-5 pt-4",
              PAYWALL_MODAL_CARD,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-muted/50 hover:bg-muted transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>

            <div
              className={cn(
                "flex flex-col min-h-0 flex-1 gap-3 pt-1 pr-8 overflow-y-auto",
                PAYWALL_MODAL_SCROLL_TINT,
              )}
            >
              <div className="flex justify-center shrink-0 py-1">
                <div className={cn("w-11 h-11 flex items-center justify-center", PAYWALL_HERO_ICON_WRAP)}>
                  <Crown className={cn("w-5 h-5", PAYWALL_HERO_ICON_CLASS)} />
                </div>
              </div>

              <div className="text-center shrink-0 space-y-1.5 px-0.5">
                {paywallCustomMessage ? (
                  <p className="text-lg font-semibold leading-snug text-foreground text-balance whitespace-pre-line break-words">
                    {paywallCustomMessage}
                  </p>
                ) : (
                  <>
                    <h2
                      className={cn(
                        "font-semibold leading-snug text-foreground text-center",
                        resolvedReason === "limit_chat"
                          ? "text-[clamp(0.9375rem,3.9vw,1.125rem)] whitespace-nowrap tracking-tight"
                          : "text-lg text-balance",
                      )}
                    >
                      {copy.title}
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed text-balance whitespace-pre-line">
                      {copy.body}
                    </p>
                  </>
                )}
              </div>
              <p className="text-center text-[11px] text-muted-foreground/90 leading-relaxed px-1 shrink-0 pb-1">
                Тысячи мам уже используют каждый день
              </p>
            </div>

            <div
              className={cn(
                "shrink-0 flex flex-col gap-3 pt-3 mt-auto pb-[max(0.75rem,env(safe-area-inset-bottom))]",
                PAYWALL_MODAL_BOTTOM_PANEL,
              )}
            >
              {showPayForm && (
                <>
                  <div className={cn("p-3", PAYWALL_PLANS_CONTAINER)}>
                    <PaywallSubscriptionPlans value={pricingOption} onChange={setPricingOption} density="compact" />
                  </div>

                  {!hasAccess && !trialUnavailable && (
                    <div className="text-center space-y-1 px-1 shrink-0">
                      <p className="text-sm font-semibold text-primary leading-snug">
                        {trialFreeShortLine(TRIAL_DURATION_DAYS)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-muted-foreground leading-relaxed">
                        Отменить можно в любой момент
                      </p>
                    </div>
                  )}

                  {hasTrialAccess && trialRemainingDays != null && (
                    <p className="text-center text-xs text-muted-foreground leading-relaxed">
                      Осталось {trialRemainingDays}{" "}
                      {trialRemainingDays === 1 ? "день" : trialRemainingDays < 5 ? "дня" : "дней"}
                    </p>
                  )}
                  {trialUnavailable && (
                    <p className="text-center text-xs text-muted-foreground leading-relaxed">{PAYWALL_TRIAL_ALREADY_USED}</p>
                  )}

                  {!hasAccess && !trialUnavailable && (
                    <Button
                      variant="default"
                      size="sm"
                      className={cn("w-full h-12 text-sm font-semibold rounded-xl border-0", PAYWALL_PRIMARY_CTA)}
                      onClick={() => handleStartTrial()}
                      disabled={isStartingTrial}
                    >
                      <Heart className="w-4 h-4 mr-2 shrink-0" />
                      {isStartingTrial ? "Активация…" : "Попробовать бесплатно 3 дня"}
                    </Button>
                  )}

                  {hasTrialAccess && (
                    <p className="text-center text-xs text-muted-foreground -mt-1 leading-relaxed">{PAYWALL_TRIAL_ACTIVE_HINT}</p>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-full h-10 py-1 rounded-xl flex flex-col gap-0 justify-center leading-none min-h-10 hover:text-foreground",
                      PAYWALL_OUTLINE_PAY_CTA,
                    )}
                    onClick={handlePayPremium}
                    disabled={isStartingPayment}
                  >
                    {isStartingPayment ? (
                      <span className="text-sm">Перенаправление…</span>
                    ) : (
                      <span className="text-sm font-semibold leading-tight">{paywallSubscribeCtaLabel(pricingOption)}</span>
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "w-full h-10 text-sm rounded-xl",
                      isOnboardingSecondAllergy
                        ? "text-gray-600 hover:text-gray-800 dark:text-muted-foreground dark:hover:text-foreground"
                        : "text-gray-500 hover:text-gray-700 dark:text-muted-foreground dark:hover:text-foreground",
                    )}
                    onClick={handleContinueFree}
                  >
                    {paywallCustomMessage && !isOnboardingSecondAllergy
                      ? "Позже"
                      : "Остаться на бесплатной версии"}
                  </Button>
                </>
              )}

              {isPremium && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-10 rounded-xl text-sm"
                  onClick={handleManageSubscription}
                >
                  Управлять подпиской
                </Button>
              )}

              <PaywallLegalConsentNote
                className="text-[10px] px-1 pt-0.5 leading-relaxed"
                tone={isOnboardingSecondAllergy ? "readableLight" : "default"}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
