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
import { UNIFIED_PAYWALL_FOOTER, PAYWALL_TRIAL_ALREADY_USED, PAYWALL_TRIAL_ACTIVE_HINT } from "@/utils/unifiedPaywallCopy";
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
import type { PaywallSharedProps } from "./LegacyPaywall";
import {
  ONBOARDING_SECOND_ALLERGY_PAYWALL_BODY,
  ONBOARDING_SECOND_ALLERGY_PAYWALL_TITLE,
} from "@/utils/onboardingSecondAllergyPaywallCopy";

function unifiedTrialHeadline(days: number): string {
  if (days === 1) return "1 день полного доступа бесплатно";
  if (days >= 2 && days <= 4) return `${days} дня полного доступа бесплатно`;
  return `${days} дней полного доступа бесплатно`;
}

/**
 * Единый paywall: один layout и один набор текстов для всех точек входа.
 * `paywall_reason` в сторе используется только для аналитики (`paywall_view`).
 */
export function UnifiedPaywall({ isOpen, onClose, onSubscribe }: PaywallSharedProps) {
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
  const reasonCopy = useMemo(() => getPaywallReasonCopy(paywallReason), [paywallReason]);

  useEffect(() => {
    if (isOpen) {
      trackUsageEvent("paywall_view", {
        properties: { paywall_reason: resolvedReason },
      });
      trackPaywallTextShown(resolvedReason, { surface: "unified_paywall" });
    }
  }, [isOpen, resolvedReason]);

  const handleStartTrial = async () => {
    trackUsageEvent("paywall_primary_click", {
      properties: { paywall_reason: resolvedReason },
    });
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
    trackUsageEvent("paywall_secondary_click", {
      properties: { paywall_reason: resolvedReason },
    });
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
              "w-full max-w-md max-h-[100dvh] sm:max-h-[min(100dvh,720px)] flex flex-col overflow-hidden",
              PAYWALL_MODAL_CARD,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-2.5 right-2.5 z-20 p-2 rounded-full bg-muted/50 hover:bg-muted transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Верх: при нехватке места скроллится; цены и CTA всегда внизу */}
            <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
              <div
                className={cn(
                  "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2.5 pb-1.5 sm:px-5 sm:pt-3 sm:pb-2 pr-11 space-y-2",
                  PAYWALL_MODAL_SCROLL_TINT,
                )}
              >
                <div className="flex justify-center shrink-0">
                  <div
                    className={cn(
                      "w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center",
                      PAYWALL_HERO_ICON_WRAP,
                    )}
                  >
                    <Crown className={cn("w-[18px] h-[18px]", PAYWALL_HERO_ICON_CLASS)} />
                  </div>
                </div>

                <div className="text-center space-y-1 px-0.5">
                  {paywallCustomMessage && !isOnboardingSecondAllergy ? (
                    <p className="text-base font-semibold leading-snug text-foreground text-balance whitespace-pre-line break-words">
                      {paywallCustomMessage}
                    </p>
                  ) : isOnboardingSecondAllergy ? (
                    <>
                      <h2 className="text-xl font-semibold leading-snug text-gray-900 dark:text-foreground text-balance">
                        {ONBOARDING_SECOND_ALLERGY_PAYWALL_TITLE}
                      </h2>
                      <p className="text-sm text-gray-800 dark:text-muted-foreground leading-snug text-balance whitespace-pre-line">
                        {ONBOARDING_SECOND_ALLERGY_PAYWALL_BODY}
                      </p>
                    </>
                  ) : (
                    <>
                      <h2
                        className={cn(
                          "font-semibold leading-snug text-foreground text-center",
                          resolvedReason === "limit_chat"
                            ? "text-[clamp(0.9375rem,3.9vw,1.25rem)] whitespace-nowrap tracking-tight"
                            : "text-xl text-balance",
                        )}
                      >
                        {reasonCopy.title}
                      </h2>
                      <p className="text-sm text-muted-foreground leading-snug text-balance whitespace-pre-line">
                        {reasonCopy.body}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div
                className={cn(
                  "shrink-0 flex flex-col gap-2 px-4 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pt-2",
                  PAYWALL_MODAL_BOTTOM_PANEL,
                )}
              >
                {showPayForm && (
                  <>
                    <div className={cn("p-2", PAYWALL_PLANS_CONTAINER)}>
                      <PaywallSubscriptionPlans value={pricingOption} onChange={setPricingOption} density="comfortable" />
                    </div>

                    {hasTrialAccess && trialRemainingDays != null ? (
                      <p className="text-center text-xs text-muted-foreground leading-snug">
                        Осталось {trialRemainingDays}{" "}
                        {trialRemainingDays === 1 ? "день" : trialRemainingDays < 5 ? "дня" : "дней"}
                      </p>
                    ) : null}
                    {trialUnavailable ? (
                      <p className="text-center text-xs text-muted-foreground leading-snug">{PAYWALL_TRIAL_ALREADY_USED}</p>
                    ) : null}

                    {!hasAccess && !trialUnavailable ? (
                      <p className="text-center text-sm font-semibold text-primary leading-tight px-1">
                        {unifiedTrialHeadline(TRIAL_DURATION_DAYS)}
                      </p>
                    ) : null}

                    {!hasAccess && !trialUnavailable ? (
                      <Button
                        variant="default"
                        size="sm"
                        className={cn(
                          "w-full h-12 text-sm font-semibold rounded-xl border-0",
                          PAYWALL_PRIMARY_CTA,
                        )}
                        onClick={() => void handleStartTrial()}
                        disabled={isStartingTrial}
                      >
                        <Heart className="w-4 h-4 mr-2 shrink-0" />
                        {isStartingTrial ? "Активация…" : "Попробовать бесплатно 3 дня"}
                      </Button>
                    ) : null}

                    {hasTrialAccess ? (
                      <p className="text-center text-[11px] text-muted-foreground -mt-1 leading-snug">{PAYWALL_TRIAL_ACTIVE_HINT}</p>
                    ) : null}

                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "w-full h-11 py-1 rounded-xl flex flex-col gap-0 justify-center leading-none min-h-11 hover:text-foreground",
                        PAYWALL_OUTLINE_PAY_CTA,
                      )}
                      onClick={handlePayPremium}
                      disabled={isStartingPayment}
                    >
                      {isStartingPayment ? (
                        <span className="text-sm font-medium">Перенаправление…</span>
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

                    <p
                      className={cn(
                        "text-center text-xs leading-snug px-1",
                        isOnboardingSecondAllergy
                          ? "text-gray-600 dark:text-muted-foreground"
                          : "text-gray-500 dark:text-muted-foreground",
                      )}
                    >
                      {UNIFIED_PAYWALL_FOOTER}
                    </p>
                  </>
                )}

                {isPremium ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-10 rounded-xl text-sm"
                    onClick={handleManageSubscription}
                  >
                    Управлять подпиской
                  </Button>
                ) : null}

                <PaywallLegalConsentNote
                  className="text-[9px] px-0.5"
                  tone={isOnboardingSecondAllergy ? "readableLight" : "default"}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
