import { motion } from "framer-motion";
import { CalendarPlus, Pencil } from "lucide-react";
import type { MyRecipePreview } from "@/hooks/useMyRecipes";
import { RecipeCard } from "@/components/recipe/RecipeCard";

export interface MyRecipeCardProps {
  recipe: MyRecipePreview;
  index?: number;
  onTap: () => void;
  onAddToPlan?: () => void;
  onEdit?: (e: React.MouseEvent) => void;
  isPremium?: boolean;
}

export function MyRecipeCard({ recipe, index = 0, onTap, onAddToPlan, onEdit, isPremium }: MyRecipeCardProps) {
  const chips = recipe.ingredientNames ?? [];
  const cookTime = recipe.cookTimeMinutes;
  const cookingTimeMinutes = Number.isFinite(cookTime) && cookTime != null ? cookTime : null;
  const nutrition =
    recipe.calories != null || recipe.proteins != null || recipe.fats != null || recipe.carbs != null
      ? {
          calories: recipe.calories ?? null,
          proteins: recipe.proteins ?? null,
          fats: recipe.fats ?? null,
          carbs: recipe.carbs ?? null,
        }
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <RecipeCard
        variant="preview"
        previewPresentation="collection"
        header={{
          mealLabel: null,
          cookingTimeMinutes,
          title: recipe.title ?? "Рецепт",
        }}
        ingredients={chips}
        showIngredientChips={false}
        showHint={false}
        nutrition={nutrition}
        nutritionGoals={(recipe as { nutrition_goals?: string[] | null }).nutrition_goals ?? []}
        nutritionGoalsMaxVisible={2}
        onClick={onTap}
        actions={
          <div className="flex flex-col items-center gap-2 shrink-0">
            <span className="text-[10px] font-medium text-muted-foreground/65 px-0.5 text-center leading-snug max-w-[4.25rem] line-clamp-2">
              Мой рецепт
            </span>
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(e);
                }}
                className="h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground/85 bg-transparent border border-border/45 hover:bg-muted/40 active:scale-[0.98] transition-all shrink-0"
                aria-label="Редактировать"
              >
                <Pencil className="h-[17px] w-[17px] stroke-[1.5]" />
              </button>
            )}
            {onAddToPlan && isPremium && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToPlan();
                }}
                className="h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground/85 bg-transparent border border-border/45 hover:bg-muted/40 active:scale-[0.98] transition-all shrink-0"
                aria-label="Добавить в план"
              >
                <CalendarPlus className="h-[17px] w-[17px] stroke-[1.5]" />
              </button>
            )}
          </div>
        }
      />
    </motion.div>
  );
}
