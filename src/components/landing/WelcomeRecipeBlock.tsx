import { Loader2 } from "lucide-react";
import { useRecipes } from "@/hooks/useRecipes";
import type { IngredientItem, RecipeDisplayIngredients } from "@/types/recipe";
import { getMealLabel } from "@/data/mealLabels";
import { getBenefitLabel } from "@/utils/ageCategory";
import { recipeHeroCard } from "@/theme/recipeTokens";
import { IngredientChips } from "@/components/recipe/IngredientChips";
import { ChefAdviceCard } from "@/components/recipe/ChefAdviceCard";
import { RecipeSteps } from "@/components/recipe/RecipeSteps";
import { RecipeNutritionHeader } from "@/components/recipe/RecipeNutritionHeader";
import { cn } from "@/lib/utils";
import type { PublicRecipePayload } from "@/services/publicRecipeShare";

const WELCOME_RECIPE_ID = "4dcaf358-5aea-4806-89c1-ffe02e96d8e3";

export interface WelcomeRecipeBlockProps {
  /** Передать рецепт для публичной страницы шаринга; иначе загружается демо-рецепт по WELCOME_RECIPE_ID */
  recipe?: PublicRecipePayload | null;
  /** Показывать лоадер (для публичной страницы, пока рецепт грузится) */
  isLoading?: boolean;
}

function getDisplayIngredients(recipe: RecipeDisplayIngredients): IngredientItem[] {
  const items = recipe.ingredients_items;
  if (Array.isArray(items) && items.length > 0) return items;

  const raw = recipe.ingredients;
  if (!Array.isArray(raw) || raw.length === 0) return [];

  return raw.map((item): IngredientItem => {
    if (typeof item === "string") return { name: item };
    const o = item as {
      name?: string;
      display_text?: string | null;
      canonical_amount?: number | null;
      canonical_unit?: string | null;
      amount?: number | null;
      unit?: string | null;
      note?: string;
      substitute?: string | null;
    };
    return {
      name: o.name ?? "",
      display_text: o.display_text ?? undefined,
      canonical_amount: o.canonical_amount ?? undefined,
      canonical_unit:
        o.canonical_unit === "g" || o.canonical_unit === "ml" ? o.canonical_unit : undefined,
      amount: o.amount ?? undefined,
      unit: o.unit ?? undefined,
      note: o.note ?? undefined,
      substitute: o.substitute ?? undefined,
    };
  });
}

/** Read-only recipe block for welcome: same look as in-app recipe (meal chip, time, calories, BJU, title, description, ingredients, chef advice, steps). Optional max-height + fade. */
export function WelcomeRecipeBlock({ recipe: recipeProp, isLoading: isLoadingProp }: WelcomeRecipeBlockProps = {}) {
  const { getRecipeById } = useRecipes();
  const { data: recipeFromHook, isLoading: isLoadingHook, error } = getRecipeById(WELCOME_RECIPE_ID);

  const isLoading = recipeProp !== undefined ? isLoadingProp ?? false : isLoadingHook;
  const recipe = recipeProp !== undefined ? recipeProp : recipeFromHook;

  if (isLoading) {
    return (
      <section className="mb-10 flex min-h-[200px] items-center justify-center rounded-2xl border border-border/80 bg-card/50">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (recipeProp === null || error || !recipe) {
    return null;
  }

  const recipeDisplay = recipe as RecipeDisplayIngredients & {
    title?: string;
    description?: string;
    steps?: { instruction?: string; step_number?: number }[];
    chefAdvice?: string;
    advice?: string | null;
    cooking_time_minutes?: number | null;
    min_age_months?: number | null;
  };
  const mealType = (recipeDisplay as { meal_type?: string | null }).meal_type ?? null;
  const mealLabel = getMealLabel(mealType);
  const cookingTime = recipeDisplay.cooking_time_minutes;
  const description = recipeDisplay.description;
  const minAgeMonths = recipeDisplay.min_age_months;
  const benefitLabel = description?.trim() ? getBenefitLabel(minAgeMonths ?? undefined) : null;
  const steps = recipeDisplay.steps ?? [];
  const chefAdvice =
    recipeDisplay.chefAdvice ?? (recipeDisplay as { chef_advice?: string | null }).chef_advice;
  const advice = recipeDisplay.advice ?? (recipeDisplay as { advice?: string | null }).advice;

  const recipeNutrition =
    (recipe as { calories?: number | null }).calories != null ||
    (recipe as { proteins?: number | null }).proteins != null ||
    (recipe as { fats?: number | null }).fats != null ||
    (recipe as { carbs?: number | null }).carbs != null
      ? {
          calories: (recipe as { calories?: number | null }).calories ?? null,
          proteins: (recipe as { proteins?: number | null }).proteins ?? null,
          fats: (recipe as { fats?: number | null }).fats ?? null,
          carbs: (recipe as { carbs?: number | null }).carbs ?? null,
        }
      : null;

  const displayIngredients = getDisplayIngredients(recipe as RecipeDisplayIngredients);

  return (
    <section className="mb-10">
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden",
          "max-h-[65vh] min-h-0 flex flex-col"
        )}
      >
        <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 rounded-2xl border border-border/80 bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06),0_4px_16px_-6px_rgba(0,0,0,0.04)]">
          <div className={cn(recipeHeroCard, "relative space-y-4 p-6 rounded-2xl")}>
            <div className="space-y-4">
              <h3 className="text-typo-body sm:text-typo-title font-medium leading-snug text-foreground">
                {recipeDisplay.title ?? "Рецепт"}
              </h3>

              <RecipeNutritionHeader
                mealTypeLabel={mealLabel}
                cookingTimeMinutes={
                  typeof cookingTime === "number" ? cookingTime : null
                }
                nutrition={recipeNutrition}
                variant="details"
              />

              {benefitLabel && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <span aria-hidden="true">🌿</span>
                  <span>{benefitLabel}</span>
                </p>
              )}
              {description?.trim() && (
                <p className="text-sm text-muted-foreground leading-[1.6]">
                  {description.trim()}
                </p>
              )}
            </div>
          </div>

          <div className="px-4 pb-6 -mt-2">
            <IngredientChips
              className="mt-4"
              ingredients={displayIngredients}
              variant="full"
            />

            {chefAdvice?.trim() ? (
              <ChefAdviceCard
                title="Совет от шефа"
                body={chefAdvice.trim()}
                isChefTip
                className="mt-6"
              />
            ) : advice?.trim() ? (
              <ChefAdviceCard
                title="Совет от шефа"
                body={advice.trim()}
                isChefTip={false}
                className="mt-6"
              />
            ) : null}

            <RecipeSteps steps={steps} className="mt-6" />
          </div>
        </div>

        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent rounded-b-2xl"
          aria-hidden
        />
      </div>
    </section>
  );
}
