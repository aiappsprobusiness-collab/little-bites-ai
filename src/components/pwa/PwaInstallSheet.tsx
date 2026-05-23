import { AnimatePresence, motion } from "framer-motion";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PwaInstallInstructions } from "@/components/pwa/PwaInstallInstructions";
import {
  PAYWALL_MODAL_CARD,
  PAYWALL_MODAL_SCROLL_TINT,
  PAYWALL_OVERLAY,
  PAYWALL_PRIMARY_CTA,
} from "@/utils/paywallBrandStyles";
import { cn } from "@/lib/utils";

export type PwaInstallSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  isIOSDevice: boolean;
  canInstall?: boolean;
  onInstall?: () => void;
  /** Авто-предложение: «Позже»; из профиля: одна кнопка «Понятно». */
  variant?: "promo" | "help";
};

export function PwaInstallSheet({
  open,
  onClose,
  title,
  description,
  isIOSDevice,
  canInstall = false,
  onInstall,
  variant = "promo",
}: PwaInstallSheetProps) {
  const showManualSteps = !canInstall;
  const isHelp = variant === "help";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            "fixed inset-0 z-[57] flex items-end sm:items-center justify-center p-0 sm:p-4",
            PAYWALL_OVERLAY,
          )}
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className={cn("w-full max-w-md flex flex-col overflow-hidden", PAYWALL_MODAL_CARD)}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-title"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-2.5 right-2.5 z-20 p-2 rounded-full bg-muted/50 hover:bg-muted transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>

            <div className={cn("px-5 pt-6 pb-4 space-y-4", PAYWALL_MODAL_SCROLL_TINT)}>
              <div className="flex flex-col items-center text-center gap-3">
                <div className="rounded-2xl border-2 border-primary bg-primary-pill-surface/90 p-2 shadow-sm shadow-primary/10">
                  <img
                    src="/icon-192.png"
                    alt=""
                    width={56}
                    height={56}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <h2 id="pwa-install-title" className="text-lg font-semibold text-balance text-foreground">
                    {title}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed text-balance">{description}</p>
                </div>
              </div>

              {showManualSteps && (
                <PwaInstallInstructions variant={isIOSDevice ? "ios" : "android"} />
              )}
            </div>

            <div className="px-5 pb-5 pt-1 space-y-2 border-t border-primary/10 bg-background">
              {canInstall && onInstall && (
                <Button
                  className={cn("w-full h-12 rounded-2xl font-semibold", PAYWALL_PRIMARY_CTA)}
                  onClick={onInstall}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Установить
                </Button>
              )}
              <Button
                variant="ghost"
                className={cn("w-full rounded-2xl", !canInstall && "h-11")}
                onClick={onClose}
              >
                {isHelp ? "Понятно" : "Позже"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
