import { QUICK_CHIP_ITEMS } from "@/data/sosTopics";
import { HelpChipRow } from "@/components/help-ui";

export interface SosQuickChipsProps {
  onSelect: (prefillText: string) => void;
}

export function SosQuickChips({ onSelect }: SosQuickChipsProps) {
  const items = QUICK_CHIP_ITEMS.map((item) => ({
    label: item.label,
    value: item.prefillText,
  }));

  return (
    <div className="w-full -mx-4 px-4 overflow-x-auto scrollbar-none">
      <HelpChipRow items={items} onSelect={onSelect} />
    </div>
  );
}
