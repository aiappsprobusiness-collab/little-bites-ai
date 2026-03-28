import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Crown, Check, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { trackUsageEvent } from "@/utils/usageEvents";
import { resolvePaywallReason } from "@/utils/paywallReasonCopy";
import { TRIAL_DURATION_DAYS } from "@/utils/subscriptionRules";
import {
  UNIFIED_PAYWALL_TITLE,
  UNIFIED_PAYWALL_SUBTITLE,
  UNIFIED_PAYWALL_BULLETS,
  UNIFIED_PAYWALL_FOOTER,
} from "@/utils/unifiedPaywallCopy";
import { PaywallLegalConsentNote } from "@/components/legal/PaywallLegalConsentNote";
import pricing from "../../../supabase/functions/create-payment/pricing.json";
import type { PaywallSharedProps } from "./LegacyPaywall";

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
  const showPayForm = !hasAccess || hasTrialAccess;
  const trialUnavailable = trialUsed && !hasTrialAccess;

  useEffect(() => {
    if (isOpen) {
      trackUsageEvent("paywall_view", {
        properties: { paywall_reason: resolvePaywallReason(paywallReason) },
      });
    }
  }, [isOpen, paywallReason]);

  const handleStartTrial = async () => {
    trackUsageEvent("paywall_primary_click", {
      properties: { paywall_reason: resolvePaywallReason(paywallReason) },
    });
    try {
      await startTrial();
      trackUsageEvent("trial_started");
      onSubscribe?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "TRIAL_ALREADY_USED") {
        toast({ variant: "default", title: "Триал уже использован", description: "Оформите подписку для полного доступа." });
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
      properties: { paywall_reason: resolvePaywallReason(paywallReason) },
    });
    onClose();
  };

  const handleManageSubscription = () => {
    onClose();
    navigate("/subscription/manage");
  };

  const payLine =
    pricingOption === "month"
      ? `${pricing.monthRub.toLocaleString("ru-RU")} ₽/мес`
      : `${pricing.yearRub.toLocaleString("ru-RU")} ₽/год`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
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
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-2 sm:px-5 sm:pt-4 pr-11 space-y-3">
                {paywallCustomMessage ? (
                  <div className="shrink-0 p-2.5 rounded-xl bg-primary/10 border border-primary/20 min-w-0">
                    <p className="text-xs font-medium text-foreground text-center leading-snug line-clamp-4 whitespace-pre-line break-words">
                      {paywallCustomMessage}
                    </p>
                  </div>
                ) : null}

                <div className="flex justify-center shrink-0 pt-0.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400/90 to-orange-500/90 flex items-center justify-center shadow-md shadow-amber-500/15">
                    <Crown className="w-[18px] h-[18px] text-white" />
                  </div>
                </div>

                <div className="text-center space-y-1.5 px-0.5">
                  <h2 className="text-xl font-semibold leading-snug text-foreground text-balance">
                    {UNIFIED_PAYWALL_TITLE}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-snug text-balance">
                    {UNIFIED_PAYWALL_SUBTITLE}
                  </p>
                </div>

                <ul className="space-y-1.5 min-w-0 pb-0.5 mt-4">
                  {UNIFIED_PAYWALL_BULLETS.map((text, index) => (
                    <li key={`${text}-${index}`} className="flex items-start gap-2 text-[13px] leading-snug min-w-0">
                      <span className="w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-2 h-2 text-primary" strokeWidth={3} />
                      </span>
                      <span className="text-foreground/90 min-w-0 flex-1">{text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="shrink-0 flex flex-col gap-2.5 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 border-t border-border/40 bg-background/95 backdrop-blur-sm">
                {showPayForm && (
                  <>
                    <div className="rounded-xl border border-border bg-card/60 p-2.5 space-y-1.5">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setPricingOption("month")}
                          className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                            pricingOption === "month"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/50 text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {pricing.monthRub.toLocaleString("ru-RU")} ₽ / мес
                        </button>
                        <button
                          type="button"
                          onClick={() => setPricingOption("year")}
                          className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                            pricingOption === "year"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/50 text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {pricing.yearRub.toLocaleString("ru-RU")} ₽ / год
                        </button>
                      </div>
                      {pricingOption === "year" ? (
                        <p className="text-[10px] text-center text-muted-foreground leading-snug">
                          Экономия ~17% · {Math.round(pricing.yearRub / 12).toLocaleString("ru-RU")} ₽/мес
                        </p>
                      ) : null}
                    </div>

                    {hasTrialAccess && trialRemainingDays != null ? (
                      <p className="text-center text-xs text-muted-foreground leading-snug">
                        Осталось {trialRemainingDays}{" "}
                        {trialRemainingDays === 1 ? "день" : trialRemainingDays < 5 ? "дня" : "дней"}
                      </p>
                    ) : null}
                    {trialUnavailable ? (
                      <p className="text-center text-xs text-muted-foreground leading-snug">Триал уже использован</p>
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
                        className="w-full h-12 text-sm font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground"
                        onClick={() => void handleStartTrial()}
                        disabled={isStartingTrial}
                      >
                        <Heart className="w-4 h-4 mr-2 shrink-0" />
                        {isStartingTrial ? "Активация…" : "Попробовать бесплатно"}
                      </Button>
                    ) : null}

                    {hasTrialAccess ? (
                      <p className="text-center text-[11px] text-muted-foreground -mt-1 leading-snug">У вас активен trial</p>
                    ) : null}

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-11 py-1 rounded-xl flex flex-col gap-0 justify-center leading-none min-h-11"
                      onClick={handlePayPremium}
                      disabled={isStartingPayment}
                    >
                      {isStartingPayment ? (
                        <span className="text-sm">Перенаправление…</span>
                      ) : (
                        <>
                          <span className="text-sm font-semibold leading-tight">Открыть полный доступ</span>
                          <span className="text-[11px] font-normal text-muted-foreground mt-0.5 leading-snug">{payLine}</span>
                        </>
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-10 text-sm text-muted-foreground hover:text-foreground rounded-xl"
                      onClick={handleContinueFree}
                    >
                      {paywallCustomMessage ? "Позже" : "Остаться на Free"}
                    </Button>

                    <p className="text-center text-xs text-muted-foreground leading-snug px-1">{UNIFIED_PAYWALL_FOOTER}</p>
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

                <PaywallLegalConsentNote className="text-[9px] px-0.5" />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
