import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface HelpChipItem {
  label: string;
  value?: string;
}

export interface HelpChipRowProps {
  items: HelpChipItem[];
  onSelect: (value: string) => void;
  /** Значение активного чипа (по value или label) */
  activeValue?: string | null;
  className?: string;
}

/**
 * Горизонтальный ряд чипсов без переноса. Стиль: 8px 12px padding, rounded-full, светлая рамка; active — оливковая рамка и заливка 8%.
 */
export function HelpChipRow({
  items,
  onSelect,
  activeValue = null,
  className,
}: HelpChipRowProps) {
  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto pb-1 scrollbar-none",
        className
      )}
    >
      {items.map((item) => {
        const value = item.value ?? item.label;
        const isActive = activeValue != null && activeValue === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onSelect(value)}
            className={cn(
              "shrink-0 py-2 px-3 rounded-full border text-[13px] font-medium whitespace-nowrap",
              "transition-colors active:scale-[0.98]",
              isActive
                ? "border-primary bg-primary/[0.08] text-foreground"
                : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/[0.06]"
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
