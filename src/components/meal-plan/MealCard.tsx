import { useNavigate } from "react-router-dom";
import { Heart, Share2 } from "lucide-react";
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
  /** Total ingredient count; used for "+N" chip when > 4 */
  ingredientTotalCount?: number | null;
  hint?: string | null;
  /** Optional: pass to Recipe page for header meta */
  mealTypeLabel?: string;
  /** When true (e.g. Plan day view): slot header shown outside; still shows title + cookTime + chips when provided */
  compact?: boolean;
  className?: string;
  /** When true, actions are hidden and chips show placeholders if empty */
  isLoadingPreviews?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (recipeId: string, next: boolean) => void;
  onShare?: (recipeId: string, recipeTitle: string) => void;
}

const CHIP_PLACEHOLDER_COUNT = 3;

export function MealCard({
  mealType,
  recipeTitle,
  recipeId,
  ageMonths,
  cookTimeMinutes,
  ingredientNames = [],
  ingredientTotalCount,
  hint,
  mealTypeLabel,
  compact = false,
  className,
  isLoadingPreviews = false,
  isFavorite = false,
  onToggleFavorite,
  onShare,
}: MealCardProps) {
  const navigate = useNavigate();
  const meta = MEAL_LABELS[mealType] ?? { label: mealType, emoji: "🍽", time: "" };
  const timeStr = meta.time ? ` · ${meta.time}` : "";
  const ageStr = formatAge(ageMonths ?? null);
  const cookStr = cookTimeMinutes != null ? `${cookTimeMinutes} мин` : "";
  const metaLine2 = [ageStr, cookStr].filter(Boolean).join(" · ");
  const chips = ingredientNames.slice(0, INGREDIENT_CHIPS_MAX);
  const total = ingredientTotalCount ?? ingredientNames.length;
  const extraCount = total > INGREDIENT_CHIPS_MAX ? total - INGREDIENT_CHIPS_MAX : 0;
  const showPlaceholderChips = compact && isLoadingPreviews && chips.length === 0 && extraCount === 0;

  const handleClick = () => {
    navigate(`/recipe/${recipeId}`, {
      state: { fromMealPlan: true, mealTypeLabel: mealTypeLabel ?? meta.label },
    });
  };

  const showActions = !isLoadingPreviews && (onToggleFavorite ?? onShare) != null;
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite?.(recipeId, !isFavorite);
  };
  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onShare?.(recipeId, recipeTitle);
  };

  if (compact) {
    const showChips = chips.length > 0 || extraCount > 0 || showPlaceholderChips;
    const showCookTime = cookTimeMinutes != null && cookTimeMinutes > 0;
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Открыть рецепт: ${recipeTitle}`}
        onClick={handleClick}
        onKeyDown={(e) => e.key === "Enter" && handleClick()}
        className={cn(
          "w-full text-left rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
          "p-4 min-h-[44px] flex flex-col gap-1.5",
          "active:opacity-95 transition-opacity",
          "touch-manipulation cursor-pointer",
          className
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-typo-body font-semibold text-foreground leading-tight">
              {recipeTitle}
            </div>
            {showCookTime && (
              <div className="text-typo-caption text-muted-foreground">⏱️ {cookTimeMinutes} мин</div>
            )}
            {showChips && (
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {showPlaceholderChips
                  ? Array.from({ length: CHIP_PLACEHOLDER_COUNT }).map((_, i) => (
                      <Skeleton key={i} className="h-5 w-14 rounded-md shrink-0" />
                    ))
                  : (
                    <>
                      {chips.map((name, i) => (
                        <span
                          key={`${name}-${i}`}
                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-typo-caption"
                        >
                          {name}
                        </span>
                      ))}
                      {extraCount > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-typo-caption">
                          +{extraCount}
                        </span>
                      )}
                    </>
                  )}
              </div>
            )}
          </div>
          {showActions && (
            <div
              className="flex shrink-0 gap-1"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={handleFavoriteClick}
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center transition-all active:scale-95 border shrink-0",
                    isFavorite
                      ? "text-amber-600/90 bg-amber-50/70 fill-amber-600/90 border-amber-200/40"
                      : "text-slate-400 bg-slate-50/50 border-slate-200/40 hover:border-slate-200/60 hover:text-slate-500"
                  )}
                  title="В избранное"
                  aria-label={isFavorite ? "Удалить из избранного" : "Добавить в избранное"}
                >
                  <Heart className={cn("h-3.5 w-3.5", isFavorite && "fill-current")} />
                </button>
              )}
              {onShare && (
                <button
                  type="button"
                  onClick={handleShareClick}
                  className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center text-slate-400 bg-slate-50/50 border border-slate-200/40 hover:border-slate-200/60 hover:text-slate-500 active:scale-95 transition-all"
                  title="Поделиться"
                  aria-label="Поделиться"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Открыть рецепт: ${recipeTitle}`}
      onClick={handleClick}
      className={cn(
        "w-full text-left rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
        "p-4 min-h-[44px] flex flex-col gap-1.5",
        "active:opacity-95 transition-opacity",
        "touch-manipulation",
        className
      )}
    >
      <div className="text-typo-caption text-muted-foreground">
        {meta.emoji} {meta.label}{timeStr}
      </div>
      <div className="text-typo-body font-semibold text-foreground leading-tight">
        {recipeTitle}
      </div>
      {metaLine2 && (
        <div className="text-typo-caption text-muted-foreground">{metaLine2}</div>
      )}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {chips.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-typo-caption"
            >
              {name}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-typo-caption">
              +{extraCount}
            </span>
          )}
        </div>
      )}
      {hint && (
        <div className="text-typo-caption text-muted-foreground mt-0.5 leading-relaxed">
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
        "w-full rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-2",
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
