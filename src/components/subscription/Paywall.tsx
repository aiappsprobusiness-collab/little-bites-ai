import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Crown, Check, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { trackUsageEvent } from "@/utils/usageEvents";
import { getPaywallReasonCopy, resolvePaywallReason } from "@/utils/paywallReasonCopy";
import { TRIAL_DURATION_DAYS } from "@/utils/subscriptionRules";
import pricing from "../../../supabase/functions/create-payment/pricing.json";

interface PaywallProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribe?: () => void;
}

/** На экране показываем 2 пункта — укладываемся в высоту без скролла */
const BULLET_CAP = 2;

function trialAccentLabel(days: number): string {
  if (days === 1) return "1 день полного доступа бесплатно";
  if (days >= 2 && days <= 4) return `${days} дня полного доступа бесплатно`;
  return `${days} дней полного доступа бесплатно`;
}

export function Paywall({ isOpen, onClose, onSubscribe }: PaywallProps) {
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
  const displayBullets = useMemo(() => copy.bullets.slice(0, BULLET_CAP), [copy.bullets]);

  useEffect(() => {
    if (isOpen) {
      trackUsageEvent("paywall_view", {
        properties: { paywall_reason: resolvePaywallReason(paywallReason) },
      });
    }
  }, [isOpen, paywallReason]);

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
    trackUsageEvent("paywall_secondary_click");
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
            className="w-full max-w-md max-h-[100dvh] sm:max-h-[min(100dvh,640px)] flex flex-col overflow-hidden bg-gradient-to-b from-background via-background to-secondary/20 rounded-t-2xl sm:rounded-2xl px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-muted/50 hover:bg-muted transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col min-h-0 flex-1 gap-1.5 pt-1 pr-8">
              {paywallCustomMessage && (
                <div className="shrink-0 p-2 rounded-lg bg-primary/10 border border-primary/20 min-w-0">
                  <p className="text-[11px] font-medium text-foreground text-center leading-snug line-clamp-3 whitespace-pre-line break-words">
                    {paywallCustomMessage}
                  </p>
                </div>
              )}

              <div className="flex justify-center shrink-0 py-0.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400/90 to-orange-500/90 flex items-center justify-center shadow-md shadow-amber-500/15">
                  <Crown className="w-[18px] h-[18px] text-white" />
                </div>
              </div>

              <div className="text-center shrink-0 space-y-0.5 px-0.5">
                <h2 className="text-base font-semibold leading-tight text-foreground line-clamp-2">
                  {copy.title}
                </h2>
                <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                  {copy.body}
                </p>
                <p className="text-[11px] text-muted-foreground/90 leading-snug pt-0.5 line-clamp-1">
                  {copy.subtitle}
                </p>
              </div>

              <ul className="shrink-0 space-y-1 min-w-0 py-0.5">
                {displayBullets.map((text, index) => (
                  <li key={`${text}-${index}`} className="flex items-start gap-1.5 text-[10px] leading-snug min-w-0">
                    <span className="w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-px">
                      <Check className="w-2 h-2 text-primary" strokeWidth={3} />
                    </span>
                    <span className="text-foreground/95 min-w-0 flex-1">{text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="shrink-0 flex flex-col gap-1.5 pt-1.5 mt-auto border-t border-border/40">
              {showPayForm && (
                <>
                  <div className="rounded-xl border border-border bg-card/50 p-2 space-y-1.5">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPricingOption("month")}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
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
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                          pricingOption === "year"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {pricing.yearRub.toLocaleString("ru-RU")} ₽ / год
                      </button>
                    </div>
                    {pricingOption === "year" && (
                      <p className="text-[10px] text-center text-muted-foreground leading-tight">
                        Экономия ~17% · {Math.round(pricing.yearRub / 12).toLocaleString("ru-RU")} ₽/мес
                      </p>
                    )}
                  </div>

                  {!hasAccess && !trialUnavailable && (
                    <p className="text-center text-[11px] font-semibold text-primary leading-tight">
                      {trialAccentLabel(TRIAL_DURATION_DAYS)}
                    </p>
                  )}

                  {hasTrialAccess && trialRemainingDays != null && (
                    <p className="text-center text-[10px] text-muted-foreground">
                      Осталось {trialRemainingDays}{" "}
                      {trialRemainingDays === 1 ? "день" : trialRemainingDays < 5 ? "дня" : "дней"}
                    </p>
                  )}
                  {trialUnavailable && (
                    <p className="text-center text-[10px] text-muted-foreground">Триал уже использован</p>
                  )}

                  {!hasAccess && !trialUnavailable && (
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full h-9 text-sm font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
                      onClick={() => handleStartTrial()}
                      disabled={isStartingTrial}
                    >
                      <Heart className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                      {isStartingTrial ? "Активация…" : "Попробовать бесплатно"}
                    </Button>
                  )}

                  {hasTrialAccess && (
                    <p className="text-center text-[10px] text-muted-foreground -mt-0.5">У вас активен trial</p>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-9 py-1 rounded-lg flex flex-col gap-0 leading-none min-h-9"
                    onClick={handlePayPremium}
                    disabled={isStartingPayment}
                  >
                    {isStartingPayment ? (
                      <span className="text-sm">Перенаправление…</span>
                    ) : (
                      <>
                        <span className="text-sm font-semibold leading-tight">Открыть полный доступ</span>
                        <span className="text-[10px] font-normal text-muted-foreground mt-0.5">{payLine}</span>
                      </>
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-8 text-xs text-muted-foreground hover:text-foreground rounded-lg"
                    onClick={handleContinueFree}
                  >
                    {paywallCustomMessage ? "Позже" : "Остаться на Free"}
                  </Button>
                </>
              )}

              {isPremium && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 rounded-lg text-sm"
                  onClick={handleManageSubscription}
                >
                  Управлять подпиской
                </Button>
              )}

              <p className="text-[9px] text-center text-muted-foreground leading-tight px-1 pt-0.5">
                Оплачивая подписку, вы соглашаетесь с{" "}
                <a href="/terms" className="underline hover:text-foreground">условиями</a>,{" "}
                <a href="/privacy" className="underline hover:text-foreground">конфиденциальностью</a> и{" "}
                <a href="/subscription/terms" className="underline hover:text-foreground">подпиской</a>.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
