import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface HintBadgeProps {
  /** Основная строка текста. */
  text: string;
  /** Текст во всплывающем tooltip при тапе/ховере на иконку. */
  tooltip: string;
  iconVariant?: "question";
  className?: string;
}

/**
 * Одна строка текста + маленькая иконка «?» (в кружке) + tooltip.
 * Используется в hero Плана и Чата для подсказок family/member.
 */
export function HintBadge({ text, tooltip, className }: HintBadgeProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("inline-flex items-center gap-1.5", className)} role="status">
        <span className="text-xs text-muted-foreground leading-snug">{text}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
              aria-label={tooltip}
            >
              <HelpCircle className="w-4 h-4 shrink-0" strokeWidth={2} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[260px]">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
