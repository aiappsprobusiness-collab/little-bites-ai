import { useMemo } from "react";
import { Check } from "lucide-react";
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
        <p className="text-sm text-muted-foreground leading-relaxed text-balance">{copy.body}</p>
        <ul className="space-y-2.5 min-w-0 py-1">
          {copy.bullets.map((text, index) => (
            <li key={`${text}-${index}`} className="flex items-start gap-2.5 text-xs leading-relaxed min-w-0">
              <span className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-2.5 h-2.5 text-primary" strokeWidth={3} />
              </span>
              <span className="text-foreground/95 min-w-0 flex-1">{text}</span>
            </li>
          ))}
        </ul>
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
