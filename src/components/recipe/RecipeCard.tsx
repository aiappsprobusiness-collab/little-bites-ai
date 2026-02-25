import { recipeCard } from "@/theme/recipeTokens";
import { RecipeHeader, type RecipeHeaderVariant } from "./RecipeHeader";
import { IngredientChips, type IngredientDisplayItem } from "./IngredientChips";
import { ChefAdviceCard } from "./ChefAdviceCard";
import { RecipeSteps } from "./RecipeSteps";
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
}

export function RecipeCard({
  variant = "chat",
  header,
  ingredients,
  ingredientOverrides = {},
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
}: RecipeCardProps) {
  const isPreview = variant === "preview";
  const isFull = variant === "full";
  const headerVariant: RecipeHeaderVariant = isPreview ? "compact" : isFull ? "full" : "chat";

  const tipBody = (showChefTip && chefAdvice?.trim()) ? chefAdvice!.trim() : (advice?.trim() ?? chefAdvice?.trim());
  const isChefTip = !!(showChefTip && chefAdvice?.trim());
  const tipTitle = isChefTip ? "Совет от шефа" : "Мини-совет";

  const bodyPadding = isPreview ? "p-3 pt-2" : isFull ? "p-4 pt-3 sm:p-6 sm:pt-4" : "p-3 pt-2";
  const bodySpace = "space-y-3";

  const maxChips = maxIngredientChips ?? (isPreview ? 3 : undefined);

  const innerBody = (
    <>
      <IngredientChips
        ingredients={ingredients}
        overrides={ingredientOverrides}
        maxVisible={maxChips}
        variant={isPreview ? "preview" : "full"}
        showSubstituteButton={showSubstituteButton}
        onSubstituteClick={onSubstituteClick}
      />
      {hint && isPreview && (
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
          onClick && "cursor-pointer",
          className
        )}
      >
        <div className="flex items-start justify-between gap-2 w-full">
          <div className="min-w-0 flex-1">
            <RecipeHeader {...header} variant="compact" />
            <div className={cn(bodyPadding, bodySpace)}>
              {innerBody}
            </div>
          </div>
          {actions && (
            <div className="flex shrink-0 items-start gap-1 py-4 pr-4 pl-0" onClick={(e) => e.stopPropagation()}>
              {actions}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(recipeCard, className)}>
      <RecipeHeader {...header} variant={headerVariant} />
      <div className={cn(bodyPadding, bodySpace)}>
        {innerBody}
      </div>
    </div>
  );
}
