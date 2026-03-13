import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AssistantAboutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ABOUT_TEXT = `Этот AI-помощник подбирает рецепты и вдохновляет на новые кулинарные идеи.

Просто напишите, что хотите приготовить — например «сытный ужин за 20 минут» или «сырники на завтрак». Помощник уточнит детали и сразу предложит подходящие варианты с учётом возраста и особенностей питания.

Давайте готовить вместе!`;

/**
 * Информационный экран «Что умеет Помощник»: белая карточка, скругления, кнопка OK в оливковом стиле.
 */
export function AssistantAboutSheet({ open, onOpenChange }: AssistantAboutSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "rounded-t-2xl max-h-[85vh] flex flex-col",
          "data-[state=open]:duration-300 data-[state=closed]:duration-200"
        )}
      >
        <SheetHeader className="text-left pb-2">
          <SheetTitle className="text-lg font-semibold text-foreground">
            Что умеет Помощник
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-2">
          <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">
            {ABOUT_TEXT}
          </p>
        </div>
        <div className="pt-4 pb-safe">
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full h-12 rounded-2xl font-semibold bg-primary text-primary-foreground"
          >
            OK
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
