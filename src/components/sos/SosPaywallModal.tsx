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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">
            🆘 SOS-консультант доступен только в Premium-версии
          </DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Получайте мгновенные советы от нутрициолога при запорах, аллергиях и
          отказах от еды.
        </p>
        <Button
          variant="default"
          size="lg"
          className="w-full mt-4 bg-primary text-primary-foreground hover:opacity-90 font-semibold"
          onClick={handleTryPremium}
        >
          Попробовать Premium
        </Button>
      </DialogContent>
    </Dialog>
  );
}
