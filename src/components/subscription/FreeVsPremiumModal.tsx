import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FREE_VS_PREMIUM_COL_FREE,
  FREE_VS_PREMIUM_COL_PREMIUM,
  FREE_VS_PREMIUM_CTA_CLOSE,
  FREE_VS_PREMIUM_CTA_TRIAL,
  FREE_VS_PREMIUM_DESCRIPTION,
  FREE_VS_PREMIUM_ROWS,
  FREE_VS_PREMIUM_TITLE,
  type FreeVsPremiumRow,
} from "@/constants/freeVsPremiumCopy";
import { cn } from "@/lib/utils";
import { trackPaywallTextShown } from "@/utils/paywallTextAnalytics";
import {
  PAYWALL_MODAL_BOTTOM_PANEL,
  PAYWALL_MODAL_CARD,
  PAYWALL_MODAL_SCROLL_TINT,
  PAYWALL_OVERLAY,
  PAYWALL_PRIMARY_CTA,
} from "@/utils/paywallBrandStyles";

const COMPARISON_GRID =
  "grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1.15fr)] gap-x-2 gap-y-1";

function CellIcon({ row, side }: { row: FreeVsPremiumRow; side: "free" | "premium" }) {
  const cell = side === "free" ? row.free : row.premium;
  const text = side === "free" ? row.freeText : row.premiumText;
  if (cell === "text" && text) {
    return (
      <span className="block w-full min-w-0 text-[11px] sm:text-xs font-medium text-left leading-snug whitespace-normal [overflow-wrap:anywhere]">
        {text}
      </span>
    );
  }
  const ok = cell === "yes";
  if (ok) {
    return <Check className="w-4 h-4 text-emerald-600 shrink-0" strokeWidth={2.5} aria-hidden />;
  }
  return <Lock className="w-4 h-4 text-muted-foreground/80 shrink-0" aria-hidden />;
}

export type FreeVsPremiumModalProps = {
  open: boolean;
  onClose: () => void;
  /** Показать CTA trial (нет активного trial/premium по подписке). */
  showTrialCta: boolean;
  onTryTrial: () => void;
};

export function FreeVsPremiumModal({ open, onClose, showTrialCta, onTryTrial }: FreeVsPremiumModalProps) {
  useEffect(() => {
    if (open) {
      trackPaywallTextShown("free_vs_premium_modal", { surface: "free_vs_premium" });
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            "fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4",
            PAYWALL_OVERLAY,
          )}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className={cn("w-full max-w-md max-h-[92dvh] flex flex-col overflow-hidden", PAYWALL_MODAL_CARD)}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-2 sm:px-5 border-b border-border/40 space-y-2">
              <h2 className="text-base font-semibold leading-snug text-foreground text-balance pr-8">{FREE_VS_PREMIUM_TITLE}</h2>
              <p className="text-sm text-muted-foreground leading-snug pr-8">{FREE_VS_PREMIUM_DESCRIPTION}</p>
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-3",
                PAYWALL_MODAL_SCROLL_TINT,
              )}
            >
              <div className="rounded-xl border border-border/50 overflow-hidden text-[13px]">
                <div className={cn(COMPARISON_GRID, "bg-muted/40 px-2 py-2 font-semibold text-foreground/90 items-end")}>
                  <span className="min-w-0 pb-0.5">Функция</span>
                  <span className="min-w-0 text-left">{FREE_VS_PREMIUM_COL_FREE}</span>
                  <span className="min-w-0 text-left">{FREE_VS_PREMIUM_COL_PREMIUM}</span>
                </div>
                {FREE_VS_PREMIUM_ROWS.map((row) => (
                  <div
                    key={row.feature}
                    className={cn(COMPARISON_GRID, "px-2 py-2 border-t border-border/40 items-start")}
                  >
                    <span className="text-foreground/90 leading-snug pr-1 min-w-0">{row.feature}</span>
                    <div className="flex min-w-0 justify-start">
                      <CellIcon row={row} side="free" />
                    </div>
                    <div className="flex min-w-0 justify-start">
                      <CellIcon row={row} side="premium" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div
              className={cn(
                "shrink-0 flex flex-col gap-2 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5",
                PAYWALL_MODAL_BOTTOM_PANEL,
              )}
            >
              {showTrialCta ? (
                <Button
                  type="button"
                  className={cn("w-full h-12 rounded-xl font-semibold border-0", PAYWALL_PRIMARY_CTA)}
                  onClick={onTryTrial}
                >
                  {FREE_VS_PREMIUM_CTA_TRIAL}
                </Button>
              ) : (
                <Button type="button" variant="secondary" className="w-full h-12 rounded-xl font-semibold" onClick={onClose}>
                  {FREE_VS_PREMIUM_CTA_CLOSE}
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
