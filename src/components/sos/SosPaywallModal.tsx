import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getPaywallReasonCopy } from "@/utils/paywallReasonCopy";
import { cn } from "@/lib/utils";
import { PAYWALL_OVERLAY, PAYWALL_PRIMARY_CTA } from "@/utils/paywallBrandStyles";

interface SosPaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTryPremium: () => void;
}

export function SosPaywallModal({
  open,
  onOpenChange,
  onTryPremium,
}: SosPaywallModalProps) {
  const copy = useMemo(() => getPaywallReasonCopy("help_limit"), []);

  const handleTryPremium = () => {
    onOpenChange(false);
    onTryPremium();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName={PAYWALL_OVERLAY}
        className={cn(
          "sm:max-w-md p-5 gap-3 max-h-[90dvh] overflow-y-auto border-primary/15 bg-gradient-to-b from-primary-pill-surface/40 to-background sm:rounded-2xl",
        )}
      >
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="text-lg font-semibold leading-snug text-balance">
            {copy.title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground leading-relaxed text-balance whitespace-pre-line">{copy.body}</p>
        <Button
          variant="default"
          size="sm"
          className={cn(
            "w-full h-12 font-semibold rounded-xl text-sm mt-1 border-0",
            PAYWALL_PRIMARY_CTA,
          )}
          onClick={handleTryPremium}
        >
          Попробовать Premium
        </Button>
      </DialogContent>
    </Dialog>
  );
}
