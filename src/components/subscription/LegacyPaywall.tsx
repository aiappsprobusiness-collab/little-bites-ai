import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Crown, Check, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { trackUsageEvent } from "@/utils/usageEvents";
import { trackPaywallTextShown } from "@/utils/paywallTextAnalytics";
import { getPaywallReasonCopy, resolvePaywallReason } from "@/utils/paywallReasonCopy";
import { TRIAL_DURATION_DAYS } from "@/utils/subscriptionRules";
import { PaywallLegalConsentNote } from "@/components/legal/PaywallLegalConsentNote";
import { PaywallSubscriptionPlans } from "@/components/subscription/PaywallSubscriptionPlans";
import { paywallSubscribeCtaLabel } from "@/utils/subscriptionPricing";
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
  const showPayForm = !hasAccess || hasTrialAccess;
  const trialUnavailable = trialUsed && !hasTrialAccess;

  const copy = useMemo(() => getPaywallReasonCopy(paywallReason), [paywallReason]);

  useEffect(() => {
    if (isOpen) {
      const resolved = resolvePaywallReason(paywallReason);
      trackUsageEvent("paywall_view", {
        properties: { paywall_reason: resolved },
      });
      trackPaywallTextShown(
        paywallCustomMessage ? `legacy_custom_${resolved}` : `legacy_context_${resolved}`,
        { surface: "legacy_paywall" }
      );
    }
  }, [isOpen, paywallReason, paywallCustomMessage]);

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
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="w-full max-w-md max-h-[100dvh] sm:max-h-[min(100dvh,800px)] min-h-[68dvh] sm:min-h-0 flex flex-col overflow-hidden bg-gradient-to-b from-background via-background to-secondary/20 rounded-t-2xl sm:rounded-2xl px-5 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-muted/50 hover:bg-muted transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col min-h-0 flex-1 gap-3 pt-1 pr-8 overflow-y-auto">
              <div className="flex justify-center shrink-0 py-1">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400/90 to-orange-500/90 flex items-center justify-center shadow-md shadow-amber-500/15">
                  <Crown className="w-5 h-5 text-white" />
                </div>
              </div>

              <div className="text-center shrink-0 space-y-1.5 px-0.5">
                {paywallCustomMessage ? (
                  <p className="text-lg font-semibold leading-snug text-foreground text-balance whitespace-pre-line break-words">
                    {paywallCustomMessage}
                  </p>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold leading-snug text-foreground text-balance">
                      {copy.title}
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed text-balance">
                      {copy.body}
                    </p>
                    {copy.subtitle.trim() ? (
                      <p className="text-sm text-muted-foreground/90 leading-relaxed pt-0.5 text-balance">
                        {copy.subtitle}
                      </p>
                    ) : null}
                  </>
                )}
              </div>

              <ul className="shrink-0 space-y-2.5 min-w-0 py-1">
                {copy.bullets.map((text, index) => (
                  <li key={`${text}-${index}`} className="flex items-start gap-2.5 text-xs leading-relaxed min-w-0">
                    <span className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-2.5 h-2.5 text-primary" strokeWidth={3} />
                    </span>
                    <span className="text-foreground/95 min-w-0 flex-1">{text}</span>
                  </li>
                ))}
              </ul>
              <p className="text-center text-[11px] text-muted-foreground/90 leading-relaxed px-1 shrink-0 pb-1">
                Тысячи мам уже используют каждый день
              </p>
            </div>

            <div className="shrink-0 flex flex-col gap-3 pt-3 mt-auto border-t border-border/40">
              {showPayForm && (
                <>
                  <div className="rounded-xl border border-border bg-card/50 p-3">
                    <PaywallSubscriptionPlans value={pricingOption} onChange={setPricingOption} density="compact" />
                  </div>

                  {!hasAccess && !trialUnavailable && (
                    <div className="text-center space-y-1 px-1 shrink-0">
                      <p className="text-sm font-semibold text-primary leading-snug">
                        {trialFreeShortLine(TRIAL_DURATION_DAYS)}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
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
                      className="w-full h-12 text-sm font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground"
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
                    className="w-full h-10 py-1 rounded-xl flex flex-col gap-0 justify-center leading-none min-h-10"
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
                    className="w-full h-10 text-sm text-muted-foreground hover:text-foreground rounded-xl"
                    onClick={handleContinueFree}
                  >
                    {paywallCustomMessage ? "Позже" : "Остаться на бесплатной версии"}
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

              <PaywallLegalConsentNote className="text-[10px] px-1 pt-0.5 leading-relaxed" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
