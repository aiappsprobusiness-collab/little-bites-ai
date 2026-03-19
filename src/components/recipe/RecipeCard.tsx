import { recipeCard } from "@/theme/recipeTokens";
import { RecipeHeader, type RecipeHeaderVariant } from "./RecipeHeader";
import { IngredientChips, type IngredientDisplayItem } from "./IngredientChips";
import { RecipeIngredientList } from "./RecipeIngredientList";
import { ChefAdviceCard } from "./ChefAdviceCard";
import { RecipeSteps } from "./RecipeSteps";
import { NutritionGoalsChips } from "./NutritionGoalsChips";
import { cn } from "@/lib/utils";

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
  /** Количество порций для блока ингредиентов (в списке, не в превью). По умолчанию 1. */
  servingsCount?: number;
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
  servingsCount = 1,
}: RecipeCardProps) {
  const isPreview = variant === "preview";
  const isFull = variant === "full";
  const headerVariant: RecipeHeaderVariant = isPreview ? "compact" : isFull ? "full" : "chat";
  const headerWithNutrition = { ...header, nutrition };

  const tipBody = (showChefTip && chefAdvice?.trim()) ? chefAdvice!.trim() : (advice?.trim() ?? chefAdvice?.trim());
  const isChefTip = !!(showChefTip && chefAdvice?.trim());
  const tipTitle = "Совет от шефа";

  const bodyPadding = isPreview ? "p-3 pt-2 pb-1" : isFull ? "p-4 pt-3 sm:p-6 sm:pt-4" : "p-3 pt-2";
  const bodySpace = isPreview ? "space-y-2" : "space-y-3";

  /** В превью — чипсы (если showIngredientChips); в chat/full — единый список ингредиентов. */
  const showChips = showIngredientChips ?? !isPreview;
  const maxChips = maxIngredientChips ?? (isPreview ? 3 : undefined);

  const innerBody = (
    <>
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
      <NutritionGoalsChips goals={nutritionGoals} className={isPreview ? "mt-0.5" : "mt-1"} />
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
        <ChefAdviceCard title={tipTitle} body={tipBody} isChefTip={isChefTip} />
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
          "bg-primary/[0.06]",
          onClick && "cursor-pointer",
          className
        )}
      >
        <div className="flex items-stretch justify-between gap-0 w-full">
          <div className="min-w-0 flex-1">
            <RecipeHeader
              {...headerWithNutrition}
              variant="compact"
              className="bg-transparent shadow-none rounded-none -mb-px"
            />
            <div className={cn(bodyPadding, bodySpace)}>
              {innerBody}
            </div>
          </div>
          {actions && (
            <div className="flex flex-col shrink-0 items-center gap-1 py-2 pr-3 pl-2" onClick={(e) => e.stopPropagation()}>
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
