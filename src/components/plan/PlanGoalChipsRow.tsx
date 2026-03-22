import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_GOAL_SELECT_ORDER, planGoalChipLabel } from "@/utils/planGoalSelect";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
 * Пилюля цели: тот же уровень контрола, что профиль, но чуть тише (как `MemberSelectorButton variant="light"`).
 */
const planGoalSelectorPillBase =
  "flex items-center gap-1.5 rounded-full min-h-[40px] h-9 px-3 py-2 text-sm font-medium text-foreground bg-muted/60 border border-border whitespace-nowrap truncate max-w-[140px] shadow-none transition-colors";

export type PlanGoalCompactSheetProps = PlanGoalChipsRowProps & {
  /** Во время генерации плана — как у селектора профиля. */
  disabled?: boolean;
};

function isGoalRowSelected(value: string | null, g: string): boolean {
  if (g === "balanced") return value === "balanced" || value === null;
  return value === g;
}

/**
 * Селектор цели в hero Плана (пилюля + ChevronDown) и диалог выбора в формате `MemberSelectorButton`.
 * В `MealPlanPage` — в одном ряду с профилем: `justify-start gap-3`.
 */
export function PlanGoalCompactSheet({ className, disabled = false, ...rowProps }: PlanGoalCompactSheetProps) {
  const [open, setOpen] = useState(false);
  const summary =
    rowProps.value == null || rowProps.value === "balanced" ? "Баланс" : planGoalChipLabel(rowProps.value);

  const { value, onChange, hasPremiumAccess = true, onLockedGoalClick } = rowProps;

  const handleOpenChange = (next: boolean) => {
    if (disabled && next) return;
    setOpen(next);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-disabled={disabled}
        onClick={() => !disabled && setOpen(true)}
        className={cn(
          planGoalSelectorPillBase,
          disabled ? "opacity-70 cursor-not-allowed pointer-events-none" : "hover:bg-muted active:opacity-95 cursor-pointer",
          className,
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Выбрать цель подбора: ${summary}`}
      >
        <span className="min-w-0 truncate max-w-[100px]">{summary}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="rounded-2xl max-w-[90vw]">
          <DialogHeader>
            <DialogTitle className="text-typo-title font-semibold">Цель подбора меню</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1 py-2 max-h-[min(70vh,420px)] overflow-y-auto">
            {PLAN_GOAL_SELECT_ORDER.map((g) => {
              const label = planGoalChipLabel(g);
              const isBalanced = g === "balanced";
              const locked = !isBalanced && !hasPremiumAccess;
              const selected = isGoalRowSelected(value, g);

              return (
                <button
                  key={g}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (locked) {
                      setOpen(false);
                      onLockedGoalClick?.();
                      return;
                    }
                    if (selected) {
                      onChange(null);
                    } else {
                      onChange(g);
                    }
                    setOpen(false);
                  }}
                  className={cn(
                    "text-left py-3 px-4 rounded-xl min-h-[44px] transition-colors disabled:opacity-70",
                    locked && "opacity-65 text-muted-foreground",
                    selected && !locked ? "bg-primary-light font-medium text-text-main" : !locked && "hover:bg-muted text-foreground",
                  )}
                >
                  {locked ? `${label} 🔒` : label}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
