import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  REPLACE_MEAL_PAYWALL_CTA_BACK,
  REPLACE_MEAL_PAYWALL_CTA_PRICING,
  REPLACE_MEAL_PAYWALL_CTA_TRIAL,
  REPLACE_MEAL_PAYWALL_SUBTITLE,
  REPLACE_MEAL_PAYWALL_TITLE,
} from "@/constants/replaceMealPaywallCopy";

export type ReplaceMealSoftPaywallModalProps = {
  open: boolean;
  onClose: () => void;
  onTryTrial: () => void;
  onOpenPricing: () => void;
  isStartingTrial?: boolean;
};

export function ReplaceMealSoftPaywallModal({
  open,
  onClose,
  onTryTrial,
  onOpenPricing,
  isStartingTrial = false,
}: ReplaceMealSoftPaywallModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => !isStartingTrial && onClose()}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="w-full max-w-md max-h-[100dvh] sm:max-h-[min(100dvh,720px)] flex flex-col overflow-hidden bg-gradient-to-b from-background via-background to-secondary/20 rounded-t-2xl sm:rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-2 sm:px-5 sm:pt-5 space-y-3">
                <h2 className="text-lg font-semibold leading-snug text-foreground text-balance">
                  {REPLACE_MEAL_PAYWALL_TITLE}
                </h2>
                <p className="text-sm text-muted-foreground leading-snug text-balance">{REPLACE_MEAL_PAYWALL_SUBTITLE}</p>
              </div>

              <div className="shrink-0 flex flex-col gap-2 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 border-t border-border/40 bg-background/95 backdrop-blur-sm">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="w-full h-12 text-sm font-semibold rounded-xl"
                  disabled={isStartingTrial}
                  onClick={onTryTrial}
                >
                  {REPLACE_MEAL_PAYWALL_CTA_TRIAL}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full h-11 text-sm rounded-xl"
                  disabled={isStartingTrial}
                  onClick={onClose}
                >
                  {REPLACE_MEAL_PAYWALL_CTA_BACK}
                </Button>
                <button
                  type="button"
                  className="w-full py-2 text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-50"
                  disabled={isStartingTrial}
                  onClick={onOpenPricing}
                >
                  {REPLACE_MEAL_PAYWALL_CTA_PRICING}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
