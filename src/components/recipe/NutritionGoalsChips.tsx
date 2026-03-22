import { cn } from "@/lib/utils";
import { normalizeNutritionGoals, nutritionGoalLabel } from "@/utils/nutritionGoals";

export function NutritionGoalsChips({
  goals,
  className,
  maxVisible,
  quiet = false,
}: {
  goals?: unknown;
  className?: string;
  /** Ограничить число чипов (например, 1 в превью на вкладке План). */
  maxVisible?: number;
  /** Приглушённый вид (меньше конкурирует с основным контентом карточки). */
  quiet?: boolean;
}) {
  const normalized = normalizeNutritionGoals(goals);
  const visible =
    maxVisible != null && maxVisible >= 0 ? normalized.slice(0, maxVisible) : normalized;
  if (visible.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {visible.map((goal) => (
        <span
          key={goal}
          className={cn(
            quiet
              ? "inline-flex items-center rounded-md border border-border/45 bg-muted/20 px-1.5 py-px text-[10px] font-normal text-muted-foreground"
              : "inline-flex items-center rounded-full border border-primary-border bg-primary-light px-2 py-0.5 text-[11px] font-medium text-foreground",
          )}
        >
          {nutritionGoalLabel(goal)}
        </span>
      ))}
    </div>
  );
}
