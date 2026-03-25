import { recipeCard } from "@/theme/recipeTokens";
import { RecipeHeader, type RecipeHeaderVariant } from "./RecipeHeader";
import { IngredientChips, type IngredientDisplayItem } from "./IngredientChips";
import { RecipeIngredientList } from "./RecipeIngredientList";
import { ChefAdviceCard } from "./ChefAdviceCard";
import { RecipeSteps } from "./RecipeSteps";
import { NutritionGoalsChips } from "./NutritionGoalsChips";
import { cn } from "@/lib/utils";
import { getChefAdviceCardPresentation } from "@/utils/infantRecipe";

export type RecipeCardVariant = "preview" | "chat" | "full";

export interface RecipeCardHeaderProps {
  mealLabel: string | null;
  cookingTimeMinutes: number | null | undefined;
  title: string;
  benefitLabel?: string | null;
  description?: string | null;
}

export interface RecipeCardProps {
  variant?: RecipeCardVariant;
  header: RecipeCardHeaderProps;
  ingredients: IngredientDisplayItem[];
  ingredientOverrides?: Record<number, string>;
  /** When false, ingredient chips are hidden (e.g. Favorites/Plan/MyRecipes previews). Default true in full/chat, false in preview from lists. */
  showIngredientChips?: boolean;
  /** When false, hint (💡 Chef advice line) is hidden in preview. Used in Plan/Favorites/My Recipes lists. */
  showHint?: boolean;
  maxIngredientChips?: number;
  showSubstituteButton?: boolean;
  onSubstituteClick?: (idx: number, ing: IngredientDisplayItem) => void;
  chefAdvice?: string | null;
  advice?: string | null;
  showChefTip?: boolean;
  steps?: Array<string | { instruction?: string; step_number?: number }>;
  hint?: string | null;
  actions?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
  /** КБЖУ на порцию (мета-строка в шапке + строка БЖУ под шапкой). */
  nutrition?: { calories?: number | null; proteins?: number | null; fats?: number | null; carbs?: number | null } | null;
  nutritionGoals?: unknown;
  /** Сколько целей показывать в превью. Не задано — все цели. */
  nutritionGoalsMaxVisible?: number;
  /** Тихие чипсы целей (вкладка План). */
  nutritionGoalsQuiet?: boolean;
  /** Количество порций для блока ингредиентов (в списке, не в превью). По умолчанию 1. */
  servingsCount?: number;
  /**
   * Превью в списке «коллекции» (избранное / мои рецепты): тише мета, мягче фон, больше воздуха.
   * `infant` — плотнее шапка и тело, колонка действий слева с разделителем (прикорм в плане).
   */
  previewPresentation?: "default" | "collection" | "infant";
  /**
   * Возрастной диапазон рецепта (для блоков подсказок).
   * Используется для infant UX: label "Совет от шефа" -> "Подсказка для мамы".
   * Не ломает обычные flows, т.к. проп опциональный.
   */
  recipeMaxAgeMonths?: number | null;
}

export function RecipeCard({
  variant = "chat",
  header,
  ingredients,
  ingredientOverrides = {},
  showIngredientChips,
  showHint = true,
  maxIngredientChips,
  showSubstituteButton = false,
  onSubstituteClick,
  chefAdvice,
  advice,
  showChefTip = false,
  steps,
  hint,
  actions,
  onClick,
  className,
  children,
  nutrition,
  nutritionGoals,
  nutritionGoalsMaxVisible,
  nutritionGoalsQuiet = false,
  servingsCount = 1,
  previewPresentation = "default",
  recipeMaxAgeMonths = null,
}: RecipeCardProps) {
  const isPreview = variant === "preview";
  const isFull = variant === "full";
  const isCollectionPreview = isPreview && previewPresentation === "collection";
  const isInfantPreview = isPreview && previewPresentation === "infant";
  const headerVariant: RecipeHeaderVariant = isPreview ? "compact" : isFull ? "full" : "chat";
  const headerWithNutrition = { ...header, nutrition };

  const tipBody = (showChefTip && chefAdvice?.trim()) ? chefAdvice!.trim() : (advice?.trim() ?? chefAdvice?.trim());
  const isChefTipFromSource = !!(showChefTip && chefAdvice?.trim());
  const { title: tipTitle, isChefTip: effectiveIsChefTip } = getChefAdviceCardPresentation({
    recipe: { max_age_months: recipeMaxAgeMonths },
    isChefTip: isChefTipFromSource,
  });

  const bodyPadding = isCollectionPreview
    ? "px-3.5 pt-2.5 pb-2.5"
    : isInfantPreview
      ? "px-2.5 pt-1.5 pb-1"
      : isPreview
        ? "p-3 pt-2 pb-1"
        : isFull
          ? "p-4 pt-3 sm:p-6 sm:pt-4"
          : "p-3 pt-2";
  const bodySpace = isPreview ? (isInfantPreview ? "space-y-1.5" : "space-y-2") : "space-y-3";

  /** В превью — чипсы (если showIngredientChips); в chat/full — единый список ингредиентов. */
  const showChips = showIngredientChips ?? !isPreview;
  const maxChips = maxIngredientChips ?? (isPreview ? 3 : undefined);

  const innerBody = (
    <>
      {isPreview && (
        <NutritionGoalsChips
          goals={nutritionGoals}
          maxVisible={nutritionGoalsMaxVisible}
          quiet={nutritionGoalsQuiet || isCollectionPreview || isInfantPreview}
          className={cn(
            isCollectionPreview ? "-mt-1 mb-1.5" : isInfantPreview ? "-mt-1.5 mb-0.5" : "-mt-2 mb-1",
          )}
        />
      )}
      {isPreview && showChips && (
        <IngredientChips
          ingredients={ingredients}
          overrides={ingredientOverrides}
          maxVisible={maxChips}
          variant="preview"
          hideSectionLabel={isPreview}
          showSubstituteButton={showSubstituteButton}
          onSubstituteClick={onSubstituteClick}
        />
      )}
      {!isPreview && (
        <NutritionGoalsChips goals={nutritionGoals} className="mt-1" />
      )}
      {!isPreview && (
        <RecipeIngredientList
          ingredients={ingredients}
          overrides={ingredientOverrides}
          servingsCount={servingsCount}
        />
      )}
      {hint && isPreview && showHint && (
        <p className="text-xs text-muted-foreground leading-snug line-clamp-1" title={hint}>
          💡 {hint}
        </p>
      )}
      {!isPreview && tipBody && (
        <ChefAdviceCard title={tipTitle} body={tipBody} isChefTip={effectiveIsChefTip} />
      )}
      {!isPreview && steps && steps.length > 0 && <RecipeSteps steps={steps} />}
      {children}
    </>
  );

  if (isPreview && (onClick || actions)) {
    return (
      <div
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
        aria-label={onClick ? `Открыть рецепт: ${header.title}` : undefined}
        className={cn(
          recipeCard,
          "touch-manipulation active:opacity-95 transition-opacity",
          isCollectionPreview
            ? "bg-card border-border/60 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.06)]"
            : "bg-primary/[0.06]",
          onClick && "cursor-pointer",
          className
        )}
      >
        <div
          className={cn(
            "flex items-stretch justify-between w-full",
            isCollectionPreview ? "gap-1" : isInfantPreview ? "gap-1.5" : "gap-0",
          )}
        >
          <div className="min-w-0 flex-1">
            <RecipeHeader
              {...headerWithNutrition}
              variant="compact"
              nutritionTone={isCollectionPreview || isInfantPreview ? "quiet" : "default"}
              compactCollection={isCollectionPreview}
              compactDensity={isInfantPreview ? "tight" : "default"}
              className="bg-transparent shadow-none rounded-none -mb-px"
            />
            <div className={cn(bodyPadding, bodySpace)}>
              {innerBody}
            </div>
          </div>
          {actions && (
            <div
              className={cn(
                "flex flex-col shrink-0",
                isCollectionPreview
                  ? "items-center justify-center gap-2 py-3 pr-3 pl-1"
                  : isInfantPreview
                    ? "items-center justify-start gap-0.5 pt-2 pb-1.5 pr-2.5 pl-1.5 border-l border-border/20"
                    : "items-center justify-center gap-1 py-2 pr-3 pl-2",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {actions}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(recipeCard, className)}>
      <RecipeHeader {...headerWithNutrition} variant={headerVariant} />
      <div className={cn(bodyPadding, bodySpace)}>
        {innerBody}
      </div>
    </div>
  );
}
