import { cn } from "@/lib/utils";
import { normalizeNutritionGoals, nutritionGoalLabel } from "@/utils/nutritionGoals";

export function NutritionGoalsChips({
  goals,
  className,
}: {
  goals?: unknown;
  className?: string;
}) {
  const normalized = normalizeNutritionGoals(goals);
  if (normalized.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {normalized.map((goal) => (
        <span
          key={goal}
          className="inline-flex items-center rounded-full border border-primary-border bg-primary-light px-2 py-0.5 text-[11px] font-medium text-foreground"
        >
          {nutritionGoalLabel(goal)}
        </span>
      ))}
    </div>
  );
}
