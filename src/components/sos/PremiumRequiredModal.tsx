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
      <DialogContent className="sm:max-w-md p-4 gap-3">
        <DialogHeader className="space-y-0">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Lock className="w-4 h-4 text-primary shrink-0" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-[11px] leading-snug">
          Оформите Premium для этой функции.
        </p>
        <Button
          variant="default"
          size="sm"
          className="w-full h-9 rounded-lg font-semibold"
          onClick={() => onOpenChange(false)}
        >
          Понятно
        </Button>
      </DialogContent>
    </Dialog>
  );
}
