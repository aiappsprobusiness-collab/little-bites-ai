import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { trackUsageEvent } from "@/utils/usageEvents";
import { markPostValueTrialPromptSeen } from "@/utils/postValueTrialPromptStorage";
import {
  getPostValueTrialPromptCopy,
  type PostValueTrialPromptVariant,
} from "@/utils/postValueTrialPromptCopy";
import { PAYWALL_OVERLAY, PAYWALL_MODAL_CARD, PAYWALL_PRIMARY_CTA } from "@/utils/paywallBrandStyles";
import { cn } from "@/lib/utils";

export type PostValueTrialPromptModalProps = {
  open: boolean;
  userId: string;
  variant?: PostValueTrialPromptVariant;
  onClose: () => void;
  onTryTrial: () => void | Promise<void>;
  isStartingTrial?: boolean;
};

export function PostValueTrialPromptModal({
  open,
  userId,
  variant = "plan_only",
  onClose,
  onTryTrial,
  isStartingTrial = false,
}: PostValueTrialPromptModalProps) {
  const copy = getPostValueTrialPromptCopy(variant);
  useEffect(() => {
    if (open) {
      trackUsageEvent("post_value_trial_prompt_shown", {
        properties: { variant },
      });
    }
  }, [open, variant]);

  const handleClose = () => {
    markPostValueTrialPromptSeen(userId);
    onClose();
  };

  const handleTrial = async () => {
    trackUsageEvent("post_value_trial_prompt_click");
    markPostValueTrialPromptSeen(userId);
    await onTryTrial();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn("fixed inset-0 z-[56] flex items-end sm:items-center justify-center p-4", PAYWALL_OVERLAY)}
          onClick={() => !isStartingTrial && handleClose()}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            className={cn("w-full max-w-md rounded-2xl p-6 space-y-4", PAYWALL_MODAL_CARD)}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-center text-balance">{copy.title}</h2>
            <p className="text-sm text-muted-foreground text-center whitespace-pre-line leading-relaxed">
              {copy.body}
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <Button
                className={cn("w-full h-12 rounded-2xl font-semibold", PAYWALL_PRIMARY_CTA)}
                disabled={isStartingTrial}
                onClick={() => void handleTrial()}
              >
                {isStartingTrial ? "Активация…" : "Попробовать бесплатно 3 дня"}
              </Button>
              <Button variant="ghost" className="rounded-2xl" disabled={isStartingTrial} onClick={handleClose}>
                Позже
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
