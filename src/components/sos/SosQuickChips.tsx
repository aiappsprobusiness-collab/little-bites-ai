import { useRef } from "react";
import { QUICK_CHIP_ITEMS } from "@/data/sosTopics";

export interface SosQuickChipsProps {
  onSelect: (prefillText: string) => void;
}

export function SosQuickChips({ onSelect }: SosQuickChipsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="w-full -mx-4 px-4 overflow-x-auto scrollbar-none" ref={scrollRef}>
      <div className="flex gap-2 pb-1 min-w-0">
        {QUICK_CHIP_ITEMS.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onSelect(item.prefillText)}
            className="shrink-0 h-9 px-4 rounded-xl border border-border bg-card text-sm text-foreground hover:border-primary/40 hover:bg-primary/[0.06] active:border-primary active:bg-primary/[0.08] active:scale-[0.98] transition-colors whitespace-nowrap"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
