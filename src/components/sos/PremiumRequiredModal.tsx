import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

interface PremiumRequiredModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}

export function PremiumRequiredModal({
  open,
  onOpenChange,
  title = "Доступно в Premium",
}: PremiumRequiredModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          Оформите подписку Premium, чтобы пользоваться этой функцией.
        </p>
        <Button
          variant="default"
          className="w-full"
          onClick={() => onOpenChange(false)}
        >
          Понятно
        </Button>
      </DialogContent>
    </Dialog>
  );
}
