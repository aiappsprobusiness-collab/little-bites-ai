import { useState, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_GOAL_SELECT_ORDER, planGoalChipLabel } from "@/utils/planGoalSelect";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const MAX_VISIBLE_COLLAPSED = 3;

function collapsedGoalKeys(
  all: readonly string[],
  selected: string | null,
): string[] {
  const firstThree = all.slice(0, MAX_VISIBLE_COLLAPSED);
  if (all.length <= MAX_VISIBLE_COLLAPSED) return [...all];
  if (selected == null || firstThree.includes(selected)) return firstThree;
  const idx = all.indexOf(selected);
  if (idx < 0) return firstThree;
  return [...all.slice(0, MAX_VISIBLE_COLLAPSED - 1), all[idx]];
}

export interface PlanGoalChipsRowProps {
  /** Ключ цели из БД или null (нет выбора — обычная генерация). */
  value: string | null;
  onChange: (next: string | null) => void;
  className?: string;
  /**
   * Premium или Trial: доступны все цели.
   * Free: только «Баланс»; остальные открывают paywall по клику.
   */
  hasPremiumAccess?: boolean;
  /** Клик по заблокированной цели (Free) — открыть paywall */
  onLockedGoalClick?: () => void;
  /**
   * `sheet` — все цели сразу, приглушённые неактивные чипсы (нижний sheet выбора).
   * `default` — прежняя строка с «…» на главном экране (если понадобится снова).
   */
  density?: "default" | "sheet";
}

/**
 * Один выбор цели питания для подбора плана (повторный клик по активному — сброс в null).
 */
export function PlanGoalChipsRow({
  value,
  onChange,
  className,
  hasPremiumAccess = true,
  onLockedGoalClick,
  density = "default",
}: PlanGoalChipsRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const allGoals = PLAN_GOAL_SELECT_ORDER;
  const hasOverflow = allGoals.length > MAX_VISIBLE_COLLAPSED;
  const sheetMode = density === "sheet";
  const visibleGoals = useMemo(() => {
    if (sheetMode || isExpanded || !hasOverflow) return [...allGoals];
    return collapsedGoalKeys(allGoals, value);
  }, [allGoals, hasOverflow, isExpanded, sheetMode, value]);

  const chipTransition =
    "transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-out";

  return (
    <div className={cn("flex flex-wrap items-center gap-2 sm:gap-3", className)} role="group" aria-label="Цель подбора меню">
      {visibleGoals.map((g) => {
        const label = planGoalChipLabel(g);
        const isActive = value === g;
        const isBalanced = g === "balanced";
        const locked = !isBalanced && !hasPremiumAccess;
        const showLock = locked;

        return (
          <button
            key={g}
            type="button"
            aria-disabled={locked}
            onClick={() => {
              if (locked) {
                onLockedGoalClick?.();
                return;
              }
              if (isActive) onChange(null);
              else onChange(g);
            }}
            className={cn(
              // Всегда border-2 — без скачка ширины/высоты при смене selected/unselected
              "inline-flex items-center rounded-full border-2 px-3 py-1 text-[11px] font-medium touch-manipulation min-w-0 max-w-full whitespace-normal break-words text-left box-border",
              chipTransition,
              locked
                ? "border-border/40 bg-transparent text-muted-foreground/55 opacity-[0.65] cursor-not-allowed scale-100"
                : isActive
                  ? sheetMode
                    ? "border-primary/90 bg-primary/[0.1] text-foreground shadow-none active:scale-[0.98]"
                    : "border-primary bg-primary/[0.13] text-foreground shadow-[0_1px_2px_-0.5px_rgba(0,0,0,0.06)] active:scale-[0.98]"
                  : sheetMode
                    ? "border-border/30 bg-transparent text-muted-foreground/65 hover:border-border/50 hover:text-muted-foreground active:scale-[0.98]"
                    : "border-border/45 bg-transparent text-muted-foreground/85 hover:border-border/80 hover:text-foreground active:scale-[0.98]",
            )}
          >
            {showLock ? `${label} 🔒` : label}
          </button>
        );
      })}
      {hasOverflow && !isExpanded && !sheetMode && (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className={cn(
            "inline-flex items-center rounded-full border-2 border-dashed border-border/55 bg-transparent px-3 py-1 text-[11px] font-medium text-muted-foreground/90 box-border",
            chipTransition,
            "hover:border-border/80 hover:text-foreground active:scale-[0.98]",
          )}
          aria-label="Показать все цели"
        >
          …
        </button>
      )}
      {hasOverflow && isExpanded && !sheetMode && (
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className={cn(
            "text-[11px] font-medium text-muted-foreground/80 hover:text-foreground underline underline-offset-2 touch-manipulation px-0.5 rounded-sm",
            chipTransition,
            "active:scale-[0.98]",
          )}
        >
          Свернуть
        </button>
      )}
    </div>
  );
}

/**
 * Компактная строка в hero Плана + нижний sheet с полным выбором целей (меньше визуального шума на экране).
 */
export function PlanGoalCompactSheet({ className, ...rowProps }: PlanGoalChipsRowProps) {
  const [open, setOpen] = useState(false);
  const summary =
    rowProps.value == null || rowProps.value === "balanced" ? "Баланс" : planGoalChipLabel(rowProps.value);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full flex items-center gap-3 rounded-xl border border-border/35 bg-muted/10 px-3 py-2.5 text-left transition-colors hover:bg-muted/20 active:scale-[0.99]",
          className,
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Цель подбора: ${summary}. Открыть выбор`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/75 font-medium">Цель подбора</p>
          <p className="text-sm font-medium text-foreground truncate mt-0.5">{summary}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[88vh] overflow-y-auto pt-6 pb-8">
          <SheetHeader className="text-left space-y-1 pr-8">
            <SheetTitle>Цель подбора меню</SheetTitle>
            <SheetDescription className="text-left">
              Учитывается при «Собрать день» и «Собрать неделю». Повторный тап по выбранной цели сбрасывает акцент (остаётся баланс).
            </SheetDescription>
          </SheetHeader>
          <PlanGoalChipsRow {...rowProps} density="sheet" className="mt-5" />
        </SheetContent>
      </Sheet>
    </>
  );
}
