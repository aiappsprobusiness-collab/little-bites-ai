import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getPaywallReasonCopy } from "@/utils/paywallReasonCopy";

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
      <DialogContent className="sm:max-w-md p-5 gap-3 max-h-[90dvh] overflow-y-auto">
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="text-lg font-semibold leading-snug text-balance">
            {copy.title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground leading-relaxed text-balance whitespace-pre-line">{copy.body}</p>
        <Button
          variant="default"
          size="sm"
          className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-xl text-sm mt-1"
          onClick={handleTryPremium}
        >
          Попробовать Premium
        </Button>
      </DialogContent>
    </Dialog>
  );
}
