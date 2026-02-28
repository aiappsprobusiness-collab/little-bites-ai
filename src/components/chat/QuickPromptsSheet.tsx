import { ArrowUpRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface QuickPromptsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Список фраз-подсказок. */
  prompts: string[];
  /** При выборе подсказки: вставить текст и закрыть. */
  onSelect: (phrase: string) => void;
}

/**
 * Bottom sheet «Подсказки»: заголовок, подзаголовок, сетка chips.
 * Только UI; данные приходят снаружи (getQuickPromptsForMode).
 */
export function QuickPromptsSheet({
  open,
  onOpenChange,
  prompts,
  onSelect,
}: QuickPromptsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "rounded-t-2xl max-h-[75vh] flex flex-col",
          "data-[state=open]:duration-300 data-[state=closed]:duration-200"
        )}
      >
        <SheetHeader className="text-left pb-1 pt-1">
          <SheetTitle className="text-lg">Подсказки</SheetTitle>
          <SheetDescription className="text-sm">
            Выберите запрос — подставим в поле
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto pb-6 pt-2 -mx-1 px-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {prompts.map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() => {
                  onSelect(phrase);
                  onOpenChange(false);
                }}
                className={cn(
                  "flex items-center justify-between gap-2 text-left",
                  "px-4 py-3 rounded-xl",
                  "bg-primary-light/60 border border-primary-border/80",
                  "hover:bg-primary-light hover:border-primary-border",
                  "active:scale-[0.98] transition-all duration-150",
                  "text-[13px] leading-snug text-foreground"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{phrase}</span>
                <ArrowUpRight className="w-4 h-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
