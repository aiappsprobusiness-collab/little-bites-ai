import { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HelpAccordionItem {
  q: string;
  a: string;
}

export interface HelpAccordionProps {
  items: HelpAccordionItem[];
  openIndex: number | null;
  onToggle: (index: number) => void;
  title?: string;
  className?: string;
}

/**
 * FAQ-аккордеон: компактные отступы, стрелка с rotate-анимацией, border-radius 14–16px.
 */
export function HelpAccordion({
  items,
  openIndex,
  onToggle,
  title,
  className,
}: HelpAccordionProps) {
  return (
    <section className={cn("space-y-0.5", className)}>
      {title != null && (
        <h2 className="text-sm font-semibold text-foreground mb-2">{title}</h2>
      )}
      <div className="space-y-0.5">
        {items.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div
              key={i}
              className="rounded-2xl border border-border overflow-hidden"
            >
              <button
                type="button"
                onClick={() => onToggle(i)}
                className="w-full flex items-center justify-between gap-2 py-2.5 px-3 text-left text-sm font-medium text-foreground hover:bg-muted/40 transition-colors"
              >
                <span className="flex-1 min-w-0">{item.q}</span>
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                    isOpen && "rotate-180"
                  )}
                  aria-hidden
                />
              </button>
              {isOpen && (
                <div className="px-3 pb-2.5 text-sm text-muted-foreground leading-relaxed border-t border-border pt-2">
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
