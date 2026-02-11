import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getSubstituteOptions, type SubstituteOption } from "@/data/ingredientSubstitutes";

interface IngredientSubstituteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredientName: string;
  substituteFromDb?: string | null;
  onSelect: (replacement: string) => void;
}

export function IngredientSubstituteSheet({
  open,
  onOpenChange,
  ingredientName,
  substituteFromDb,
  onSelect,
}: IngredientSubstituteSheetProps) {
  const options = getSubstituteOptions(ingredientName, substituteFromDb);

  const handleSelect = (opt: SubstituteOption) => {
    onSelect(opt.option);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh]">
        <SheetHeader>
          <SheetTitle>Заменить: {ingredientName}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3 pb-6">
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(opt)}
              className="w-full text-left rounded-xl p-4 border border-slate-200/80 bg-slate-50/50 hover:bg-emerald-50/60 hover:border-emerald-200/80 transition-colors"
            >
              <p className="font-medium text-typo-body text-foreground">{opt.option}</p>
              <p className="text-typo-caption text-muted-foreground mt-0.5">Почему: {opt.why}</p>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
