import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { getRealSubstituteOptions, type SubstituteOption } from "@/data/ingredientSubstitutes";
import type { IngredientItem } from "@/types/recipe";
import type { IngredientOverrideEntry, IngredientOverrideAction } from "@/types/ingredientOverrides";
import { ingredientDisplayLabel } from "@/types/recipe";
import { RotateCcw, ArrowRight, Minus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Результат выбора в sheet: либо применить override, либо сбросить. */
export interface IngredientOverrideResult {
  action: IngredientOverrideAction;
  to?: { name: string; amount?: number; unit?: string; canonical_name?: string; canonical_amount?: number; canonical_unit?: string };
  ratio?: number;
}

interface IngredientSubstituteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Название ингредиента для заголовка и словаря замен */
  ingredientName: string;
  substituteFromDb?: string | null;
  /** Полный ингредиент (для "Было" и для построения override.from) */
  ingredient?: IngredientItem | null;
  /** Стабильный ключ ингредиента в рецепте */
  ingredientKey?: string;
  /** Уже применённый override для этого ингредиента (показать "Сбросить замену") */
  existingOverride?: IngredientOverrideEntry | null;
  /** Режим плана: полный UI (swap/skip/reduce, Применить, Сбросить). Иначе — только выбор варианта замены (для чата). */
  planMode?: boolean;
  /** В режиме плана: применить выбранное действие (override уже собран с key, from, updated_at). */
  onApply?: (result: IngredientOverrideResult) => void;
  /** В режиме плана: сбросить замену для этого ингредиента */
  onReset?: () => void;
  /** Простой режим (чат / каталог без плана): выбрана строка замены */
  onSelect?: (replacement: string) => void;
}

export function IngredientSubstituteSheet({
  open,
  onOpenChange,
  ingredientName,
  substituteFromDb,
  ingredient,
  ingredientKey,
  existingOverride,
  planMode = false,
  onApply,
  onReset,
  onSelect,
}: IngredientSubstituteSheetProps) {
  const options = useMemo(
    () => getRealSubstituteOptions(ingredientName, substituteFromDb),
    [ingredientName, substituteFromDb]
  );
  const hasRealSubstitutes = options.length > 0;

  const [selectedAction, setSelectedAction] = useState<IngredientOverrideAction | "">("");
  const [selectedOption, setSelectedOption] = useState<SubstituteOption | null>(null);
  const [reduceRatio, setReduceRatio] = useState(0.5);

  const wasLabel = ingredient
    ? ingredientDisplayLabel(ingredient)
    : ingredientName;

  const previewLabel = useMemo(() => {
    if (selectedAction === "swap" && selectedOption) return selectedOption.option;
    if (selectedAction === "skip") return "Пропустить";
    if (selectedAction === "reduce") return `× ${reduceRatio}`;
    return null;
  }, [selectedAction, selectedOption, reduceRatio]);

  const canApply = planMode && selectedAction !== "" && (selectedAction !== "swap" || selectedOption != null);
  const hasExisting = planMode && existingOverride != null;

  const handleApply = () => {
    if (!canApply) return;
    if (selectedAction === "swap" && selectedOption) {
      onApply?.({ action: "swap", to: { name: selectedOption.option, canonical_name: selectedOption.option.trim().toLowerCase() } });
    } else if (selectedAction === "skip") {
      onApply?.({ action: "skip" });
    } else if (selectedAction === "reduce") {
      onApply?.({ action: "reduce", ratio: reduceRatio });
    }
    onOpenChange(false);
    setSelectedAction("");
    setSelectedOption(null);
  };

  const handleReset = () => {
    onReset?.();
    onOpenChange(false);
    setSelectedAction("");
    setSelectedOption(null);
  };

  const handleSelectSimple = (opt: SubstituteOption) => {
    onSelect?.(opt.option);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setSelectedAction("");
    setSelectedOption(null);
    onOpenChange(false);
  };

  if (!planMode) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh]">
          <SheetHeader>
            <SheetTitle>Заменить: {ingredientName}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3 pb-6">
            {!hasRealSubstitutes && (
              <p className="text-sm text-muted-foreground rounded-xl bg-muted/50 border border-border/60 px-3 py-2.5">
                Для этого ингредиента пока нет готовых аналогов.
              </p>
            )}
            {options.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectSimple(opt)}
                className="w-full text-left rounded-xl p-4 border border-slate-200/80 bg-slate-50/50 hover:bg-primary-light hover:border-primary-border transition-colors"
              >
                <p className="font-medium text-typo-body text-foreground">{opt.option}</p>
                <p className="text-typo-caption text-muted-foreground mt-0.5">Почему: {opt.why}</p>
              </button>
            ))}
            {!hasRealSubstitutes && (
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleSelectSimple({ option: "пропустить", why: "исключить из списка" })}
                  className="w-full text-left rounded-xl p-3 border border-border bg-card hover:bg-muted/50"
                >
                  <span className="font-medium text-sm">Пропустить</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectSimple({ option: "уменьшить количество", why: "если есть ограничения" })}
                  className="w-full text-left rounded-xl p-3 border border-border bg-card hover:bg-muted/50"
                >
                  <span className="font-medium text-sm">Уменьшить количество</span>
                </button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>Заменить ингредиент</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-1 space-y-4 py-4">
          <div className="rounded-xl bg-muted/50 border border-border/60 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Было</p>
            <p className="text-sm font-medium text-foreground">{wasLabel}</p>
          </div>

          <AnimatePresence mode="wait">
            {previewLabel && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl bg-primary-light/40 border border-primary-border/60 p-3 flex items-center gap-2"
              >
                <span className="text-xs font-medium text-muted-foreground">Стало</span>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium text-foreground">{previewLabel}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Действие</p>
            {!hasRealSubstitutes && (
              <p className="text-sm text-muted-foreground rounded-xl bg-muted/50 border border-border/60 px-3 py-2.5">
                Для этого ингредиента пока нет готовых аналогов.
              </p>
            )}
            <div className="grid gap-2">
              {hasRealSubstitutes && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAction("swap");
                      setSelectedOption(null);
                    }}
                    className={cn(
                      "w-full text-left rounded-xl p-3 border transition-colors",
                      selectedAction === "swap"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:bg-muted/50"
                    )}
                  >
                    <span className="font-medium text-sm">Заменить на аналог</span>
                  </button>
                  {selectedAction === "swap" && (
                    <div className="pl-2 space-y-1.5">
                      {options.map((opt, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSelectedOption(opt)}
                          className={cn(
                            "w-full text-left rounded-lg py-2.5 px-3 text-sm border transition-colors",
                            selectedOption?.option === opt.option
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/60 hover:bg-muted/40"
                          )}
                        >
                          <span className="font-medium">{opt.option}</span>
                          <span className="block text-xs text-muted-foreground mt-0.5">{opt.why}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setSelectedAction("skip");
                  setSelectedOption(null);
                }}
                className={cn(
                  "w-full text-left rounded-xl p-3 border transition-colors flex items-center gap-2",
                  selectedAction === "skip"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card hover:bg-muted/50"
                )}
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span className="font-medium text-sm">Пропустить</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedAction("reduce");
                  setSelectedOption(null);
                }}
                className={cn(
                  "w-full text-left rounded-xl p-3 border transition-colors flex items-center gap-2",
                  selectedAction === "reduce"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card hover:bg-muted/50"
                )}
              >
                <Minus className="w-4 h-4 shrink-0" />
                <span className="font-medium text-sm">Уменьшить количество</span>
              </button>
              {selectedAction === "reduce" && (
                <div className="pl-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.1}
                    value={reduceRatio}
                    onChange={(e) => setReduceRatio(Number(e.target.value))}
                    className="flex-1 h-2 rounded-full appearance-none bg-muted accent-primary"
                  />
                  <span className="text-sm font-medium w-10">{Math.round(reduceRatio * 100)}%</span>
                </div>
              )}
            </div>
          </div>

          {hasExisting && (
            <button
              type="button"
              onClick={handleReset}
              className="w-full rounded-xl p-3 border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 text-destructive flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="font-medium text-sm">Сбросить замену</span>
            </button>
          )}
        </div>

        <SheetFooter className="flex-shrink-0 gap-2 pt-4 border-t border-border/60">
          <Button variant="outline" onClick={handleCancel} className="rounded-xl">
            Отмена
          </Button>
          <Button
            onClick={handleApply}
            disabled={!canApply}
            className="rounded-xl"
          >
            Применить
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
