import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { PLAN_GOAL_SELECT_ORDER, planGoalChipLabel } from "@/utils/planGoalSelect";

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
}: PlanGoalChipsRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const allGoals = PLAN_GOAL_SELECT_ORDER;
  const hasOverflow = allGoals.length > MAX_VISIBLE_COLLAPSED;
  const visibleGoals = useMemo(() => {
    if (isExpanded || !hasOverflow) return [...allGoals];
    return collapsedGoalKeys(allGoals, value);
  }, [allGoals, hasOverflow, isExpanded, value]);

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
                  ? "border-primary bg-primary/[0.13] text-foreground shadow-[0_1px_2px_-0.5px_rgba(0,0,0,0.06)] active:scale-[0.98]"
                  : "border-border/45 bg-transparent text-muted-foreground/85 hover:border-border/80 hover:text-foreground active:scale-[0.98]",
            )}
          >
            {showLock ? `${label} 🔒` : label}
          </button>
        );
      })}
      {hasOverflow && !isExpanded && (
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
      {hasOverflow && isExpanded && (
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
