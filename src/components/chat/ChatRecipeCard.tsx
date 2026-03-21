import type { ParsedIngredient } from "@/utils/parseChatRecipes";
import { getBenefitLabel } from "@/utils/ageCategory";
import { getMealLabel } from "@/data/mealLabels";
import { RecipeCard } from "@/components/recipe/RecipeCard";
import {
  buildRecipeBenefitDescription,
  resolveBenefitDescriptionSeed,
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

function ChatRecipeCard({
  recipe,
  ageMonths,
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
  const benefitSeed = resolveBenefitDescriptionSeed({
    recipeId: savedRecipeId,
    chatMessageId: chatMessageId ?? null,
    title: recipe.title ?? "",
  });
  const benefitFallbackDescription = buildRecipeBenefitDescription({
    recipeId: benefitSeed.recipeId,
    stableKey: benefitSeed.stableKey ?? null,
    goals: recipe.nutrition_goals ?? [],
    title: recipe.title ?? "",
  });
  /** Edge уже отдаёт финальный канон (LLM или benefit через pickCanonical) — совпадает с БД; не перетирать локальным builder. */
  const canonicalFromApi = (recipe.description ?? "").trim();
  const headerDescription =
    canonicalFromApi.length > 0 ? canonicalFromApi : benefitFallbackDescription;

  return (
    <RecipeCard
      variant="chat"
      header={{
        mealLabel,
        cookingTimeMinutes: recipe.cookingTime ?? null,
        title: recipe.title,
        benefitLabel,
        description: headerDescription,
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

export { ChatRecipeCard };
export default ChatRecipeCard;
