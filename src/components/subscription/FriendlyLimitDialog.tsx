import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface FriendlyLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/**
 * Мягкое состояние лимита (без paywall): спокойный заголовок и текст.
 */
export function FriendlyLimitDialog({
  open,
  onOpenChange,
  title,
  description,
  primaryLabel = "Понятно",
  secondaryLabel,
  onSecondary,
}: FriendlyLimitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-left text-lg font-semibold leading-snug">{title}</DialogTitle>
          <p className="text-left text-[15px] leading-relaxed text-foreground pt-2 whitespace-pre-line">
            {description}
          </p>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-end pt-2">
          {secondaryLabel ? (
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto rounded-xl"
              onClick={() => {
                onSecondary?.();
                onOpenChange(false);
              }}
            >
              {secondaryLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            className="w-full sm:w-auto rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
