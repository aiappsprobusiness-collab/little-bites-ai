import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, RotateCw, Loader2, Trash2, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { RecipeCard } from "@/components/recipe/RecipeCard";
import { recipeKcalChip } from "@/theme/recipeTokens";
import { getBenefitLabel } from "@/utils/ageCategory";
import { buildRecipeBenefitDescription } from "@/utils/recipeBenefitDescription";
import type { MemberTypeV2 } from "@/integrations/supabase/types-v2";

const MEAL_LABELS: Record<string, { label: string; emoji: string; time: string }> = {
  breakfast: { label: "Завтрак", emoji: "🍽", time: "8:30" },
  lunch: { label: "Обед", emoji: "🍽", time: "12:00" },
  snack: { label: "Полдник", emoji: "🍽", time: "15:00" },
  dinner: { label: "Ужин", emoji: "🍽", time: "18:00" },
};

const INGREDIENT_CHIPS_MAX = 4;
/** В compact (план): показываем не больше стольких чипсов + "+N" */
const INGREDIENT_CHIPS_MAX_COMPACT = 3;
/** Укоротить название ингредиента для чипа (убрать скобки и длинные пояснения). */
function shortIngredientName(name: string): string {
  const trimmed = name.trim();
  const beforeParen = trimmed.split(/\s*\(/)[0].trim();
  return beforeParen.length <= 20 ? beforeParen : beforeParen.slice(0, 17) + "…";
}

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
  /** Plan slot context: for ingredient overrides (save to meal_plans_v2.meals). */
  plannedDate?: string;
  /** Member id for plan row (null = family). */
  planMemberId?: string | null;
  /** When true (e.g. Plan day view): slot header shown outside; still shows title + cookTime + chips when provided */
  compact?: boolean;
  className?: string;
  /** When true, actions are hidden and chips show placeholders if empty */
  isLoadingPreviews?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (recipeId: string, next: boolean) => void;
  onShare?: (recipeId: string, recipeTitle: string) => void;
  /** Заменить этот приём пищи (план). Показывает кнопку ↻ или замочек (Free). */
  onReplace?: () => void;
  /** true = кнопка замены в состоянии загрузки (pool/AI). */
  isReplaceLoading?: boolean;
  /** true = показывать замочек вместо ↻, по клику вызывается onReplace (пейвол). */
  replaceShowsLock?: boolean;
  /** Удалить блюдо из плана (Premium). Показывает кнопку 🗑. */
  onDelete?: () => void;
  /** При включённом __PLAN_DEBUG / ?debugPool=1: показывать бейдж DB или AI. */
  debugSource?: "db" | "ai";
  /** КБЖУ на порцию (мета + БЖУ в карточке рецепта). */
  calories?: number | null;
  proteins?: number | null;
  fats?: number | null;
  carbs?: number | null;
  /** Цели питания (чипы в превью). */
  nutritionGoals?: string[] | null;
  /**
   * Контекст профиля для блока «польза» в compact-превью плана.
   * Без этого объекта подпись пользы в шапке превью не показывается.
   */
  planBenefitContext?: {
    selectedMemberId: string | null;
    ageMonths?: number | null;
    memberType?: MemberTypeV2 | "family" | null;
  };
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
  plannedDate,
  planMemberId,
  compact = false,
  className,
  isLoadingPreviews = false,
  isFavorite = false,
  onToggleFavorite,
  onShare,
  onReplace,
  isReplaceLoading = false,
  replaceShowsLock = false,
  onDelete,
  debugSource,
  calories: nutritionCalories,
  proteins: nutritionProteins,
  fats: nutritionFats,
  carbs: nutritionCarbs,
  nutritionGoals,
  planBenefitContext,
}: MealCardProps) {
  const navigate = useNavigate();
  const meta = MEAL_LABELS[mealType] ?? { label: mealType, emoji: "🍽", time: "" };
  const timeStr = meta.time ? ` · ${meta.time}` : "";
  const ageStr = formatAge(ageMonths ?? null);
  const cookStr = cookTimeMinutes != null ? `${cookTimeMinutes} мин` : "";
  const metaLine2 = [ageStr, cookStr].filter(Boolean).join(" · ");
  const maxChips = compact ? INGREDIENT_CHIPS_MAX_COMPACT : INGREDIENT_CHIPS_MAX;
  const rawChips = ingredientNames.slice(0, maxChips);
  const chips = compact ? rawChips.map(shortIngredientName) : rawChips;
  const total = ingredientTotalCount ?? ingredientNames.length;
  const extraCount = total > maxChips ? total - maxChips : 0;
  const showPlaceholderChips = compact && isLoadingPreviews && chips.length === 0 && extraCount === 0;

  const handleClick = () => {
    navigate(`/recipe/${recipeId}`, {
      state: {
        fromMealPlan: true,
        preloadedTitle: recipeTitle,
        mealTypeLabel: mealTypeLabel ?? meta.label,
        plannedDate: plannedDate ?? undefined,
        mealType,
        memberId: planMemberId ?? undefined,
      },
    });
  };

  const [replaceSpin, setReplaceSpin] = useState(false);
  const handleReplaceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isReplaceLoading) {
      setReplaceSpin(true);
      setTimeout(() => setReplaceSpin(false), 400);
    }
    onReplace?.();
  };
  const showActions = !isLoadingPreviews && (onToggleFavorite ?? onShare ?? onReplace ?? onDelete) != null;
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite?.(recipeId, !isFavorite);
  };
  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onShare?.(recipeId, recipeTitle);
  };

  if (compact) {
    const showActionsCompact = !isLoadingPreviews && (onReplace ?? onDelete) != null;
    if (isLoadingPreviews && chips.length === 0 && extraCount === 0) {
      return (
        <div
          className={cn(
            "w-full rounded-2xl border border-border bg-card shadow-soft p-4 flex flex-col gap-2 min-h-[44px]",
            className
          )}
        >
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-20" />
          <div className="flex gap-2 mt-1">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
        </div>
      );
    }
    const nutrition =
      nutritionCalories != null || nutritionProteins != null || nutritionFats != null || nutritionCarbs != null
        ? {
            calories: nutritionCalories ?? null,
            proteins: nutritionProteins ?? null,
            fats: nutritionFats ?? null,
            carbs: nutritionCarbs ?? null,
          }
        : null;

    const benefitLabel =
      planBenefitContext != null ? getBenefitLabel(planBenefitContext.ageMonths) : null;
    const benefitDescription =
      planBenefitContext != null
        ? buildRecipeBenefitDescription({
            recipeId,
            goals: nutritionGoals ?? [],
            title: recipeTitle,
          })
        : null;

    return (
      <>
        <RecipeCard
          variant="preview"
          header={{
            mealLabel: meta.label,
            cookingTimeMinutes: cookTimeMinutes ?? null,
            title: recipeTitle,
            benefitLabel,
            description: benefitDescription,
          }}
          ingredients={ingredientNames}
          showIngredientChips={false}
          showHint={false}
          maxIngredientChips={INGREDIENT_CHIPS_MAX_COMPACT}
          hint={hint ?? null}
          nutrition={nutrition}
          nutritionGoals={nutritionGoals ?? []}
          onClick={handleClick}
          actions={
            showActionsCompact ? (
              <div className="flex flex-col gap-1 items-stretch">
                {debugSource && (
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 self-start",
                      debugSource === "db" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800",
                    )}
                  >
                    {debugSource === "db" ? "DB" : "AI"}
                  </span>
                )}
                {onReplace && (
                  <button
                    type="button"
                    onClick={handleReplaceClick}
                    disabled={isReplaceLoading}
                    className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-primary bg-primary/10 border border-primary-border hover:opacity-90 active:scale-95 transition-all disabled:opacity-60 disabled:pointer-events-none"
                    title={replaceShowsLock ? "Доступно в Premium" : "Заменить"}
                    aria-label={replaceShowsLock ? "Замена блюда доступна в Premium" : "Заменить блюдо"}
                  >
                    {isReplaceLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : replaceShowsLock ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <motion.span
                        animate={{ rotate: replaceSpin ? 360 : 0 }}
                        transition={{ duration: 0.4, ease: "easeInOut" }}
                      >
                        <RotateCw className="h-4 w-4" />
                      </motion.span>
                    )}
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border hover:border-destructive/30 active:scale-95 transition-all"
                    title="Удалить из плана"
                    aria-label="Удалить блюдо из плана"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : undefined
          }
          className={className}
        />
      </>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Открыть рецепт: ${recipeTitle}`}
      onClick={handleClick}
      className={cn(
        "w-full text-left rounded-2xl border border-border bg-card shadow-soft",
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
      {(metaLine2 || nutritionCalories != null) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {metaLine2 && (
            <span className="text-typo-caption text-muted-foreground">{metaLine2}</span>
          )}
          {nutritionCalories != null && Number.isFinite(nutritionCalories) && (
            <span className={recipeKcalChip}>
              {Math.round(Number(nutritionCalories))} ккал
            </span>
          )}
        </div>
      )}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {chips.slice(0, extraCount > 0 ? chips.length - 1 : chips.length).map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-light border border-primary-border text-foreground text-typo-caption"
            >
              {name}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="inline-flex items-center gap-1.5 shrink-0">
              {chips.length > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-light border border-primary-border text-foreground text-typo-caption">
                  {chips[chips.length - 1]}
                </span>
              )}
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-light border border-primary-border text-foreground text-typo-caption">
                +{extraCount}
              </span>
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
        "w-full rounded-2xl border border-border bg-card shadow-soft p-4 flex flex-col gap-2",
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
