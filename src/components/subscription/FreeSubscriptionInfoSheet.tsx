import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trackPaywallTextShown } from "@/utils/paywallTextAnalytics";
import { cn } from "@/lib/utils";
import { PAYWALL_OVERLAY, PAYWALL_PRIMARY_CTA } from "@/utils/paywallBrandStyles";
import {
  FREE_SUBSCRIPTION_INFO_BULLETS,
  FREE_SUBSCRIPTION_INFO_TITLE,
  getFreeSubscriptionInfoLead,
  type FreeSubscriptionInfoMode,
} from "@/utils/freeSubscriptionInfoCopy";

export interface FreeSubscriptionInfoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: FreeSubscriptionInfoMode;
  recipeRemaining: number | null;
  recipeDailyLimit: number | null;
  helpUsed: number;
  helpDailyLimit: number | null;
  onRequestFullPaywall: () => void;
}

/**
 * Bottom sheet по чипу «Free» в чате: лимиты и счётчик на сегодня без fallback-paywall «Что-то не получилось».
 */
export function FreeSubscriptionInfoSheet({
  open,
  onOpenChange,
  mode,
  recipeRemaining,
  recipeDailyLimit,
  helpUsed,
  helpDailyLimit,
  onRequestFullPaywall,
}: FreeSubscriptionInfoSheetProps) {
  const lead = getFreeSubscriptionInfoLead({
    mode,
    recipeRemaining,
    recipeDailyLimit,
    helpUsed,
    helpDailyLimit,
  });

  useEffect(() => {
    if (open) {
      trackPaywallTextShown("free_subscription_info", {
        surface: "free_subscription_info_sheet",
      });
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName={PAYWALL_OVERLAY}
        className={cn(
          "sm:max-w-md rounded-2xl border-primary/15 bg-gradient-to-b from-primary-pill-surface/35 to-background",
        )}
      >
        <DialogHeader className="space-y-2 text-center sm:text-center">
          <DialogTitle className="text-base font-semibold leading-snug tracking-tight sm:text-lg text-center text-balance px-1">
            {FREE_SUBSCRIPTION_INFO_TITLE}
          </DialogTitle>
          <p className="text-[14px] leading-relaxed text-muted-foreground text-center text-balance px-1">
            {lead}
          </p>
        </DialogHeader>

        <ul className="space-y-1.5 px-1 text-left text-sm text-muted-foreground leading-snug">
          {FREE_SUBSCRIPTION_INFO_BULLETS.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="text-primary shrink-0" aria-hidden>
                •
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <DialogFooter className="flex w-full flex-col gap-2 pt-2 sm:flex-col sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            className="w-full shrink-0 rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Закрыть
          </Button>
          <Button
            type="button"
            className={cn("w-full shrink-0 rounded-xl border-0", PAYWALL_PRIMARY_CTA)}
            onClick={() => {
              onRequestFullPaywall();
              onOpenChange(false);
            }}
          >
            Узнать о полной версии
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
