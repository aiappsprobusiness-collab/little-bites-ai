import { useState } from "react";
import { Clock } from "lucide-react";
import { recipeHeaderBg, recipeMealBadge, recipeTimeClass } from "@/theme/recipeTokens";
import { NutritionBadge } from "./NutritionBadge";
import { cn } from "@/lib/utils";

export type RecipeHeaderVariant = "compact" | "chat" | "full";

export interface RecipeHeaderProps {
  mealLabel: string | null;
  cookingTimeMinutes: number | null | undefined;
  title: string;
  benefitLabel?: string | null;
  description?: string | null;
  variant?: RecipeHeaderVariant;
  /** Скрыть заголовок (например, когда он уже в SheetTitle) */
  hideTitle?: boolean;
  className?: string;
  /** Компактная чипса КБЖУ в одну строку со временем (план/избранное) */
  nutritionCompact?: { calories?: number | null; proteins?: number | null; fats?: number | null; carbs?: number | null } | null;
}

export function RecipeHeader({
  mealLabel,
  cookingTimeMinutes,
  title,
  benefitLabel,
  description,
  variant = "chat",
  hideTitle = false,
  className,
  nutritionCompact,
}: RecipeHeaderProps) {
  const isCompact = variant === "compact";
  const isFull = variant === "full";
  const paddingClass = isCompact
    ? "px-3 pt-3 pb-2"
    : isFull
      ? "px-4 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5"
      : "px-4 pt-4 pb-3";

  const titleClass = isCompact
    ? "text-sm font-medium leading-snug text-foreground line-clamp-2"
    : isFull
      ? "text-typo-body sm:text-typo-title font-medium leading-snug text-foreground"
      : "text-[15px] font-medium leading-snug text-foreground line-clamp-2";

  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const descriptionText = description?.trim() ?? "";
  const showDescription = descriptionText && (benefitLabel || descriptionText);
  const clampDescription = !isFull && descriptionText.length > 120 && !descriptionExpanded;

  return (
    <header className={cn(recipeHeaderBg, paddingClass, className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 mb-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {mealLabel && <span className={recipeMealBadge}>{mealLabel}</span>}
          {cookingTimeMinutes != null && cookingTimeMinutes > 0 && (
            <span className={recipeTimeClass}>
              <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden />
              <span>{cookingTimeMinutes} мин</span>
            </span>
          )}
          {isCompact && nutritionCompact != null && (
            <NutritionBadge
              variant="compact"
              calories={nutritionCompact.calories}
              proteins={nutritionCompact.proteins}
              fats={nutritionCompact.fats}
              carbs={nutritionCompact.carbs}
            />
          )}
        </div>
      </div>
      {!hideTitle && <h2 className={cn(titleClass, "mb-1")}>{title}</h2>}
      {showDescription && (
        <div className="space-y-0.5">
          {benefitLabel && (
            <p className="text-[11px] font-medium text-muted-foreground">{benefitLabel}</p>
          )}
          <p
            className={cn(
              "text-xs text-muted-foreground leading-relaxed break-words",
              clampDescription && "line-clamp-3"
            )}
          >
            {descriptionText}
          </p>
          {descriptionText.length > 120 && (
            <button
              type="button"
              onClick={() => setDescriptionExpanded((e) => !e)}
              className="text-xs text-primary font-medium mt-0.5 hover:underline"
            >
              {descriptionExpanded ? "Свернуть" : "Показать полностью"}
            </button>
          )}
        </div>
      )}
    </header>
  );
}
