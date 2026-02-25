import { motion } from "framer-motion";
import { CalendarPlus, Pencil } from "lucide-react";
import type { MyRecipePreview } from "@/hooks/useMyRecipes";
import { RecipeCard } from "@/components/recipe/RecipeCard";

const MAX_INGREDIENT_CHIPS = 3;

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <RecipeCard
        variant="preview"
        header={{
          mealLabel: null,
          cookingTimeMinutes,
          title: recipe.title ?? "Рецепт",
        }}
        ingredients={chips}
        maxIngredientChips={MAX_INGREDIENT_CHIPS}
        onClick={onTap}
        actions={
          <>
            <span className="text-xs font-medium rounded-md px-2 py-0.5 shrink-0 bg-muted text-muted-foreground">
              Мой рецепт
            </span>
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(e);
                }}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 active:scale-95 transition-all shrink-0"
                aria-label="Редактировать"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {onAddToPlan && isPremium && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToPlan();
                }}
                className="h-8 rounded-full px-2.5 flex items-center justify-center gap-1 text-sm text-muted-foreground border border-border hover:bg-muted/50 active:scale-95 transition-all shrink-0"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                В план
              </button>
            )}
          </>
        }
      />
    </motion.div>
  );
}
