import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackPaywallTextShown } from "@/utils/paywallTextAnalytics";
import {
  PAYWALL_MODAL_BOTTOM_PANEL,
  PAYWALL_MODAL_CARD,
  PAYWALL_MODAL_SCROLL_TINT,
  PAYWALL_OVERLAY,
  PAYWALL_PRIMARY_CTA,
} from "@/utils/paywallBrandStyles";

export type TrialLifecycleModalVariant = "ending_soon" | "expired";

type TrialLifecycleModalProps = {
  open: boolean;
  variant: TrialLifecycleModalVariant;
  /** Оставлено для обратной совместимости; текст задаётся внутри модалки. */
  endingSoonTitle?: string;
  onPrimary: () => void;
  onSecondary: () => void;
};

const TITLES: Record<TrialLifecycleModalVariant, string> = {
  ending_soon: "⏳ Пробный доступ заканчивается… Продолжайте пользоваться без ограничений",
  expired: "Пробный доступ закончился",
};

const BODY: Record<TrialLifecycleModalVariant, string> = {
  ending_soon: "Успейте оформить полную версию — план, замены и помощь останутся без дневных лимитов.",
  expired: "Доступна бесплатная версия с ограничениями. Оформите полную версию, чтобы сохранить все возможности",
};

/**
 * Лёгкая модалка: напоминание до конца trial или сообщение после окончания (не paywall).
 */
export function TrialLifecycleModal({
  open,
  variant,
  endingSoonTitle: _legacyEndingSoonTitle,
  onPrimary,
  onSecondary,
}: TrialLifecycleModalProps) {
  void _legacyEndingSoonTitle; // совместимость с TrialLifecycleModalsHost
  const title = TITLES[variant];

  useEffect(() => {
    if (open) {
      trackPaywallTextShown(
        variant === "ending_soon" ? "trial_lifecycle_ending_soon" : "trial_lifecycle_expired",
        { surface: "trial_lifecycle" }
      );
    }
  }, [open, variant]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            "fixed inset-0 z-[58] flex items-end sm:items-center justify-center p-0 sm:p-4",
            PAYWALL_OVERLAY,
          )}
          onClick={onSecondary}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 340 }}
            className={cn(
              "w-full max-w-md shadow-xl text-card-foreground flex flex-col overflow-hidden max-h-[min(92dvh,520px)]",
              PAYWALL_MODAL_CARD,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onSecondary}
              className="absolute top-2.5 right-2.5 z-20 p-2 rounded-full bg-muted/60 hover:bg-muted transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>

            <div
              className={cn(
                "px-5 pt-9 pb-4 sm:pt-10 space-y-2 pr-12",
                PAYWALL_MODAL_SCROLL_TINT,
              )}
            >
              <h2 className="text-lg font-semibold leading-snug text-foreground text-balance">{title}</h2>
              <p className="text-sm text-muted-foreground leading-snug">{BODY[variant]}</p>
            </div>

            <div
              className={cn(
                "flex flex-col gap-2 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2",
                PAYWALL_MODAL_BOTTOM_PANEL,
              )}
            >
              <Button
                variant="default"
                size="sm"
                className={cn("w-full h-11 text-sm font-semibold rounded-xl border-0", PAYWALL_PRIMARY_CTA)}
                onClick={onPrimary}
              >
                Оформить полную версию
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-10 text-sm rounded-xl text-gray-500 hover:text-gray-700 dark:text-muted-foreground dark:hover:text-foreground"
                onClick={onSecondary}
              >
                {variant === "ending_soon" ? "Позже" : "Остаться на бесплатной версии"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
