import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  const handleTryPremium = () => {
    onOpenChange(false);
    onTryPremium();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-4 gap-3">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-semibold leading-tight">
            💛 Помощь маме — в Premium
          </DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-[11px] leading-snug">
          Советы при запорах, аллергиях и отказах от еды.
        </p>
        <Button
          variant="default"
          size="sm"
          className="w-full h-9 bg-primary text-primary-foreground hover:opacity-90 font-semibold rounded-lg"
          onClick={handleTryPremium}
        >
          Попробовать Premium
        </Button>
      </DialogContent>
    </Dialog>
  );
}
