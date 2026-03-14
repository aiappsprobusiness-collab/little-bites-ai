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

const ABOUT_TEXT = `Этот чат помогает подобрать рецепт по вашему запросу.

Напишите, что хотите приготовить — в любой форме. Например:
• «ужин из итальянской кухни»
• «сырники на завтрак»
• «ужин за 20 минут»
• «что приготовить на семейный ужин»

Помощник предложит рецепт и автоматически учтёт особенности профиля: возраст детей, аллергии и предпочтения в еде.
Обычно подбор рецепта занимает 15–30 секунд.
Просто напишите свой запрос.`;

/**
 * Информационный экран «Что умеет помощник»: белая карточка, скругления, кнопка OK в оливковом стиле.
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
            Что умеет помощник
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
