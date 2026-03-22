import { recipeHeaderBg } from "@/theme/recipeTokens";
import { RecipeNutritionHeader, type RecipeNutritionHeaderSource } from "./RecipeNutritionHeader";
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
  /** КБЖУ: мета + макросы в шапке (иконки + типографика) */
  nutrition?: RecipeNutritionHeaderSource | null;
  /** Тон мета-блока (избранное / мои рецепты — тише). */
  nutritionTone?: "default" | "quiet";
  /** Компактная карточка в списке коллекции: чуть сильнее заголовок и воздух. */
  compactCollection?: boolean;
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
  nutrition,
  nutritionTone = "default",
  compactCollection = false,
}: RecipeHeaderProps) {
  const isCompact = variant === "compact";
  const isFull = variant === "full";
  const paddingClass = isCompact
    ? compactCollection
      ? "px-3.5 pt-3.5 pb-1.5"
      : "px-3 pt-3 pb-1"
    : isFull
      ? "px-4 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5"
      : "px-4 pt-4 pb-3";

  const titleClass = isCompact
    ? compactCollection
      ? "text-[15px] font-semibold leading-snug text-foreground line-clamp-2 tracking-tight"
      : "text-sm font-medium leading-snug text-foreground line-clamp-2"
    : isFull
      ? "text-typo-body sm:text-typo-title font-medium leading-snug text-foreground"
      : "text-[15px] font-medium leading-snug text-foreground line-clamp-2";

  const descriptionText = description?.trim() ?? "";
  const showDescription = descriptionText && (benefitLabel || descriptionText);

  const titleBottom = compactCollection ? "mb-2" : "mb-1.5";
  const metaBottom = compactCollection ? "mb-0.5" : "mb-1";

  return (
    <header className={cn(recipeHeaderBg, paddingClass, className)}>
      {!hideTitle && <h2 className={cn(titleClass, titleBottom)}>{title}</h2>}
      <div className={metaBottom}>
        <RecipeNutritionHeader
          mealTypeLabel={mealLabel}
          cookingTimeMinutes={cookingTimeMinutes}
          nutrition={nutrition}
          variant="card"
          tone={nutritionTone}
        />
      </div>
      {showDescription && (
        <div className="space-y-0.5">
          {benefitLabel && (
            <p className="text-[11px] font-medium text-muted-foreground">{benefitLabel}</p>
          )}
          <p className="text-xs text-muted-foreground leading-relaxed break-words">
            {descriptionText}
          </p>
        </div>
      )}
    </header>
  );
}
