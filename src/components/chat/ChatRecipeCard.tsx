import type { ParsedIngredient } from "@/utils/parseChatRecipes";
import { getBenefitLabel } from "@/utils/ageCategory";
import { getMealLabel } from "@/data/mealLabels";
import { RecipeCard } from "@/components/recipe/RecipeCard";
import {
  buildRecipeBenefitDescription,
  resolveBenefitProfileContext,
} from "@/utils/recipeBenefitDescription";

export interface ChatRecipeCardRecipe {
  title: string;
  description?: string;
  ingredients?: ParsedIngredient[];
  steps?: string[];
  cookingTime?: number;
  chefAdvice?: string;
  advice?: string;
  mealType?: string;
  calories?: number | null;
  proteins?: number | null;
  fats?: number | null;
  carbs?: number | null;
  nutrition_goals?: string[] | null;
}

export interface ChatRecipeCardProps {
  recipe: ChatRecipeCardRecipe;
  ageMonths?: number | null;
  /** Выбранный профиль в чате: id члена или "family" (из FamilyContext). */
  selectedProfileId?: string | null;
  /** Стабильный ключ до появления recipe.id в БД (например id сообщения). */
  chatMessageId?: string;
  /** UUID после сохранения рецепта — для детерминированного текста пользы. */
  savedRecipeId?: string | null;
  showChefTip: boolean;
  ingredientOverrides: Record<number, string>;
  onSubstituteClick: (idx: number, ing: ParsedIngredient) => void;
}

export function ChatRecipeCard({
  recipe,
  ageMonths,
  selectedProfileId = null,
  chatMessageId,
  savedRecipeId = null,
  showChefTip,
  ingredientOverrides,
  onSubstituteClick,
}: ChatRecipeCardProps) {
  const mealLabel = getMealLabel(recipe.mealType) ?? null;

  const nutrition =
    recipe.calories != null || recipe.proteins != null || recipe.fats != null || recipe.carbs != null
      ? {
          calories: recipe.calories ?? null,
          proteins: recipe.proteins ?? null,
          fats: recipe.fats ?? null,
          carbs: recipe.carbs ?? null,
        }
        : null;

  const benefitLabel = getBenefitLabel(ageMonths);
  const benefitContext = resolveBenefitProfileContext({
    selectedMemberId: selectedProfileId,
    ageMonths,
  });
  const benefitDescription = buildRecipeBenefitDescription({
    recipeId: savedRecipeId,
    stableKey: savedRecipeId?.trim()
      ? undefined
      : chatMessageId && recipe.title
        ? `${chatMessageId}:${recipe.title}`
        : recipe.title
          ? `title:${recipe.title}`
          : "chat",
    goals: recipe.nutrition_goals ?? [],
    context: benefitContext,
  });

  return (
    <RecipeCard
      variant="chat"
      header={{
        mealLabel,
        cookingTimeMinutes: recipe.cookingTime ?? null,
        title: recipe.title,
        benefitLabel,
        description: benefitDescription,
      }}
      ingredients={recipe.ingredients ?? []}
      ingredientOverrides={ingredientOverrides}
      showSubstituteButton={false}
      onSubstituteClick={onSubstituteClick as (idx: number, ing: unknown) => void}
      chefAdvice={recipe.chefAdvice ?? null}
      advice={recipe.advice ?? null}
      showChefTip={showChefTip}
      steps={recipe.steps}
      nutrition={nutrition}
      nutritionGoals={recipe.nutrition_goals ?? []}
    />
  );
}
