import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const MEAL_LABELS: Record<string, { label: string; emoji: string; time: string }> = {
  breakfast: { label: "Завтрак", emoji: "🍽", time: "8:30" },
  lunch: { label: "Обед", emoji: "🍽", time: "12:00" },
  snack: { label: "Полдник", emoji: "🍽", time: "15:00" },
  dinner: { label: "Ужин", emoji: "🍽", time: "18:00" },
};

const INGREDIENT_CHIPS_MAX = 4;

function formatAge(ageMonths: number | null | undefined): string {
  if (ageMonths == null) return "";
  if (ageMonths < 12) return `${ageMonths} мес`;
  const years = Math.floor(ageMonths / 12);
  if (years === 1) return "1 год";
  if (years >= 2 && years <= 4) return `${years} года`;
  return `${years} лет`;
}

export interface MealCardProps {
  mealType: string;
  recipeTitle: string;
  recipeId: string;
  ageMonths?: number | null;
  cookTimeMinutes?: number | null;
  ingredientNames?: string[];
  hint?: string | null;
  /** Optional: pass to Recipe page for header meta */
  mealTypeLabel?: string;
  /** When true (e.g. Plan day view): only recipe title; slot header is shown outside the card */
  compact?: boolean;
  className?: string;
}

export function MealCard({
  mealType,
  recipeTitle,
  recipeId,
  ageMonths,
  cookTimeMinutes,
  ingredientNames = [],
  hint,
  mealTypeLabel,
  compact = false,
  className,
}: MealCardProps) {
  const navigate = useNavigate();
  const meta = MEAL_LABELS[mealType] ?? { label: mealType, emoji: "🍽", time: "" };
  const timeStr = meta.time ? ` · ${meta.time}` : "";
  const ageStr = formatAge(ageMonths ?? null);
  const cookStr = cookTimeMinutes != null ? `${cookTimeMinutes} мин` : "";
  const metaLine2 = [ageStr, cookStr].filter(Boolean).join(" · ");
  const chips = ingredientNames.slice(0, INGREDIENT_CHIPS_MAX);
  const extraCount = ingredientNames.length - INGREDIENT_CHIPS_MAX;

  const handleClick = () => {
    navigate(`/recipe/${recipeId}`, {
      state: { fromMealPlan: true, mealTypeLabel: mealTypeLabel ?? meta.label },
    });
  };

  if (compact) {
    return (
      <button
        type="button"
        aria-label={`Открыть рецепт: ${recipeTitle}`}
        onClick={handleClick}
        className={cn(
          "w-full text-left rounded-2xl border border-border/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
          "p-4 min-h-[44px]",
          "active:opacity-95 transition-opacity",
          "touch-manipulation",
          className
        )}
      >
        <div className="font-semibold text-foreground text-base leading-tight">
          {recipeTitle}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Открыть рецепт: ${recipeTitle}`}
      onClick={handleClick}
      className={cn(
        "w-full text-left rounded-2xl border border-border/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
        "p-4 min-h-[44px] flex flex-col gap-1.5",
        "active:opacity-95 transition-opacity",
        "touch-manipulation",
        className
      )}
    >
      <div className="text-xs text-muted-foreground">
        {meta.emoji} {meta.label}{timeStr}
      </div>
      <div className="font-semibold text-foreground text-base leading-tight">
        {recipeTitle}
      </div>
      {metaLine2 && (
        <div className="text-xs text-muted-foreground">{metaLine2}</div>
      )}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {chips.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/70 text-muted-foreground text-xs"
            >
              {name}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/70 text-muted-foreground text-xs">
              +{extraCount}
            </span>
          )}
        </div>
      )}
      {hint && (
        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {hint}
        </div>
      )}
    </button>
  );
}

/** Skeleton matching MealCard layout for loading/generation states */
export function MealCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-border/40 bg-white/80 p-4 flex flex-col gap-2",
        className
      )}
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-32" />
      <div className="flex gap-2 mt-1">
        <Skeleton className="h-5 w-16 rounded-md" />
        <Skeleton className="h-5 w-20 rounded-md" />
        <Skeleton className="h-5 w-14 rounded-md" />
      </div>
    </div>
  );
}
