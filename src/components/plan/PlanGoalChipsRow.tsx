import { cn } from "@/lib/utils";
import { PLAN_GOAL_SELECT_ORDER, planGoalChipLabel } from "@/utils/planGoalSelect";

export interface PlanGoalChipsRowProps {
  /** Ключ цели из БД или null (нет выбора — обычная генерация). */
  value: string | null;
  onChange: (next: string | null) => void;
  className?: string;
}

/**
 * Один выбор цели питания для подбора плана (повторный клик по активному — сброс в null).
 */
export function PlanGoalChipsRow({ value, onChange, className }: PlanGoalChipsRowProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} role="group" aria-label="Цель подбора меню">
      {PLAN_GOAL_SELECT_ORDER.map((g) => {
        const label = planGoalChipLabel(g);
        const isActive = value === g;
        return (
          <button
            key={g}
            type="button"
            onClick={() => {
              if (isActive) onChange(null);
              else onChange(g);
            }}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors touch-manipulation",
              isActive
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
