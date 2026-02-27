import type { ParsedIngredient } from "@/utils/parseChatRecipes";
import { getBenefitLabel } from "@/utils/ageCategory";
import { getMealLabel } from "@/data/mealLabels";
import { RecipeCard } from "@/components/recipe/RecipeCard";

export interface ChatRecipeCardRecipe {
  title: string;
  description?: string;
  ingredients?: ParsedIngredient[];
  steps?: string[];
  cookingTime?: number;
  chefAdvice?: string;
  advice?: string;
  mealType?: string;
}

export interface ChatRecipeCardProps {
  recipe: ChatRecipeCardRecipe;
  ageMonths?: number | null;
  showChefTip: boolean;
  ingredientOverrides: Record<number, string>;
  onSubstituteClick: (idx: number, ing: ParsedIngredient) => void;
}

export function ChatRecipeCard({
  recipe,
  ageMonths,
  showChefTip,
  ingredientOverrides,
  onSubstituteClick,
}: ChatRecipeCardProps) {
  const mealLabel = getMealLabel(recipe.mealType) ?? null;

  return (
    <RecipeCard
      variant="chat"
      header={{
        mealLabel,
        cookingTimeMinutes: recipe.cookingTime ?? null,
        title: recipe.title,
        benefitLabel: recipe.description ? getBenefitLabel(ageMonths) : null,
        description: recipe.description ?? null,
      }}
      ingredients={recipe.ingredients ?? []}
      ingredientOverrides={ingredientOverrides}
      showSubstituteButton={false}
      onSubstituteClick={onSubstituteClick as (idx: number, ing: unknown) => void}
      chefAdvice={recipe.chefAdvice ?? null}
      advice={recipe.advice ?? null}
      showChefTip={showChefTip}
      steps={recipe.steps}
    />
  );
}
