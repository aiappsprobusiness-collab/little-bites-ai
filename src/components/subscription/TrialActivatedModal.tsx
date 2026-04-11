import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TRIAL_DURATION_DAYS } from "@/utils/subscriptionRules";
import { markTrialActivatedModalSeen } from "@/utils/trialActivatedModalStorage";
import { useAppStore } from "@/store/useAppStore";
import { trackUsageEvent } from "@/utils/usageEvents";
import { trackPaywallTextShown } from "@/utils/paywallTextAnalytics";
import { cn } from "@/lib/utils";
import {
  PAYWALL_HERO_ICON_WRAP,
  PAYWALL_MODAL_BOTTOM_PANEL,
  PAYWALL_MODAL_CARD,
  PAYWALL_MODAL_SCROLL_TINT,
  PAYWALL_OVERLAY,
  PAYWALL_PRIMARY_CTA,
} from "@/utils/paywallBrandStyles";
import {
  TRIAL_ONBOARDING_BULLETS,
  TRIAL_ONBOARDING_CTA_CONTINUE,
  TRIAL_ONBOARDING_CTA_PRICING,
  TRIAL_ONBOARDING_INTRO,
  TRIAL_ONBOARDING_TITLE,
  trialOnboardingFooterPhrase,
} from "@/constants/trialOnboardingCopy";

type TrialActivatedModalProps = {
  open: boolean;
  userId: string;
  onClose: () => void;
  onOpenPricing: () => void;
};

/**
 * Онбординг сразу после успешной активации trial (единые тексты — trialOnboardingCopy).
 */
export function TrialActivatedModal({ open, userId, onClose, onOpenPricing }: TrialActivatedModalProps) {
  useEffect(() => {
    if (open) {
      trackUsageEvent("trial_onboarding_shown");
      trackPaywallTextShown("trial_activation_modal", { surface: "trial_onboarding" });
    }
  }, [open]);

  const dismiss = () => {
    const resume = useAppStore.getState().trialOnboardingResumeCallback;
    useAppStore.getState().setTrialOnboardingResumeCallback(null);
    markTrialActivatedModalSeen(userId);
    trackUsageEvent("trial_onboarding_closed");
    onClose();
    if (resume) {
      void Promise.resolve(resume()).catch(() => {
        /* toast в вызывающем коде */
      });
    }
  };

  const subtitle = trialOnboardingFooterPhrase(TRIAL_DURATION_DAYS);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            "fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4",
            PAYWALL_OVERLAY,
          )}
          onClick={dismiss}
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
              type="button"
              onClick={dismiss}
              className="absolute top-2.5 right-2.5 z-20 p-2 rounded-full bg-muted/50 hover:bg-muted transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>

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
                      "w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-primary",
                      PAYWALL_HERO_ICON_WRAP,
                    )}
                  >
                    <Sparkles className="w-[18px] h-[18px]" strokeWidth={2} />
                  </div>
                </div>

                <div className="text-center space-y-1 px-0.5">
                  <h2 className="text-xl font-semibold leading-snug text-foreground text-balance">{TRIAL_ONBOARDING_TITLE}</h2>
                  <p className="text-sm font-medium text-foreground/90">{TRIAL_ONBOARDING_INTRO}</p>
                </div>

                <ul className="space-y-1.5 min-w-0 pb-0 mt-2">
                  {TRIAL_ONBOARDING_BULLETS.map((text) => (
                    <li key={text} className="flex items-start gap-2 text-[13px] leading-snug min-w-0">
                      <span className="w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-2 h-2 text-primary" strokeWidth={3} />
                      </span>
                      <span className="text-foreground/90 min-w-0 flex-1">{text}</span>
                    </li>
                  ))}
                </ul>

                <p className="text-xs text-muted-foreground leading-snug text-balance text-center mt-2 px-0.5">{subtitle}</p>
              </div>

              <div
                className={cn(
                  "shrink-0 flex flex-col gap-2 px-4 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pt-2",
                  PAYWALL_MODAL_BOTTOM_PANEL,
                )}
              >
                <Button
                  variant="default"
                  size="sm"
                  className={cn("w-full h-12 text-sm font-semibold rounded-xl border-0", PAYWALL_PRIMARY_CTA)}
                  onClick={dismiss}
                >
                  {TRIAL_ONBOARDING_CTA_CONTINUE}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-10 text-sm text-muted-foreground hover:text-foreground rounded-xl"
                  onClick={() => {
                    trackUsageEvent("pricing_info_opened", { properties: { source: "trial_onboarding" } });
                    onOpenPricing();
                  }}
                >
                  {TRIAL_ONBOARDING_CTA_PRICING}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
