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

export interface RecipeChatSoftLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Открыть существующий полный paywall (шаг 2). */
  onRequestFullPaywall: () => void;
}

/**
 * Шаг 1: мягкий лимит подборов рецептов (free) — без цен и без полноэкранного paywall.
 * Полный paywall только по CTA «Получить больше рецептов».
 */
export function RecipeChatSoftLimitDialog({
  open,
  onOpenChange,
  onRequestFullPaywall,
}: RecipeChatSoftLimitDialogProps) {
  useEffect(() => {
    if (open) {
      trackPaywallTextShown("recipe_soft_limit", { surface: "recipe_soft_limit_dialog" });
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-lg font-semibold leading-snug">
            Сегодня лимит подборов исчерпан 🙌
          </DialogTitle>
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            В бесплатной версии есть ограничение на количество подборов в день
          </p>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col pt-2">
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Попробовать завтра
          </Button>
          <Button
            type="button"
            className="w-full rounded-xl"
            onClick={() => {
              onRequestFullPaywall();
              onOpenChange(false);
            }}
          >
            Получить больше рецептов
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
