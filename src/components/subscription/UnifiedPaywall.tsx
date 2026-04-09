import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Crown, Check, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { trackUsageEvent } from "@/utils/usageEvents";
import { trackPaywallTextShown } from "@/utils/paywallTextAnalytics";
import { resolvePaywallReason } from "@/utils/paywallReasonCopy";
import { cn } from "@/lib/utils";
import { TRIAL_DURATION_DAYS } from "@/utils/subscriptionRules";
import {
  UNIFIED_PAYWALL_TITLE,
  UNIFIED_PAYWALL_SUBTITLE,
  UNIFIED_PAYWALL_BULLETS,
  UNIFIED_PAYWALL_FOOTER,
  PAYWALL_TRIAL_ALREADY_USED,
  PAYWALL_TRIAL_ACTIVE_HINT,
} from "@/utils/unifiedPaywallCopy";
import { PaywallLegalConsentNote } from "@/components/legal/PaywallLegalConsentNote";
import { PaywallSubscriptionPlans } from "@/components/subscription/PaywallSubscriptionPlans";
import { paywallSubscribeCtaLabel } from "@/utils/subscriptionPricing";
import type { PaywallSharedProps } from "./LegacyPaywall";
import {
  ONBOARDING_SECOND_ALLERGY_PAYWALL_BULLETS,
  ONBOARDING_SECOND_ALLERGY_PAYWALL_SUBTITLE,
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
  const paywallBullets = isOnboardingSecondAllergy ? ONBOARDING_SECOND_ALLERGY_PAYWALL_BULLETS : UNIFIED_PAYWALL_BULLETS;

  useEffect(() => {
    if (isOpen) {
      trackUsageEvent("paywall_view", {
        properties: { paywall_reason: resolvedReason },
      });
      trackPaywallTextShown(
        paywallCustomMessage && !isOnboardingSecondAllergy
          ? `unified_custom_${resolvedReason}`
          : `unified_default_${resolvedReason}`,
        { surface: "unified_paywall" }
      );
    }
  }, [isOpen, paywallReason, paywallCustomMessage, resolvedReason, isOnboardingSecondAllergy]);

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
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="w-full max-w-md max-h-[100dvh] sm:max-h-[min(100dvh,720px)] flex flex-col overflow-hidden bg-gradient-to-b from-background via-background to-secondary/20 rounded-t-2xl sm:rounded-2xl shadow-2xl"
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
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2.5 pb-1.5 sm:px-5 sm:pt-3 sm:pb-2 pr-11 space-y-2">
                <div className="flex justify-center shrink-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-amber-400/90 to-orange-500/90 flex items-center justify-center shadow-md shadow-amber-500/15">
                    <Crown className="w-[18px] h-[18px] text-white" />
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
                      <p className="text-sm text-gray-800 dark:text-muted-foreground leading-snug text-balance">
                        {ONBOARDING_SECOND_ALLERGY_PAYWALL_SUBTITLE}
                      </p>
                    </>
                  ) : (
                    <>
                      <h2 className="text-xl font-semibold leading-snug text-foreground text-balance">
                        {UNIFIED_PAYWALL_TITLE}
                      </h2>
                      <p className="text-sm text-muted-foreground leading-snug text-balance">
                        {UNIFIED_PAYWALL_SUBTITLE}
                      </p>
                    </>
                  )}
                </div>

                <ul className="space-y-1 min-w-0 pb-0 mt-3">
                  {paywallBullets.map((text, index) => (
                    <li key={`${text}-${index}`} className="flex items-start gap-2 text-[13px] leading-snug min-w-0">
                      <span className="w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-2 h-2 text-primary" strokeWidth={3} />
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1",
                          isOnboardingSecondAllergy
                            ? "text-gray-900 dark:text-foreground/90"
                            : "text-foreground/90",
                        )}
                      >
                        {text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="shrink-0 flex flex-col gap-2 px-4 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pt-2 border-t border-border/40 bg-background/95 backdrop-blur-sm">
                {showPayForm && (
                  <>
                    <div className="rounded-xl border border-border bg-card/60 p-2">
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
                        className="w-full h-12 text-sm font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm shadow-primary/20"
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
                      className="w-full h-11 py-1 rounded-xl flex flex-col gap-0 justify-center leading-none min-h-11 border-border/50 bg-muted/15 text-foreground/85 hover:bg-muted/30 hover:text-foreground font-normal"
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
                          ? "text-gray-800 hover:text-gray-950 dark:text-muted-foreground dark:hover:text-foreground"
                          : "text-muted-foreground hover:text-foreground",
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
                          ? "text-gray-800 dark:text-muted-foreground"
                          : "text-muted-foreground",
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
