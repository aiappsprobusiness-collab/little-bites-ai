import { motion } from "framer-motion";
import { Heart, CalendarPlus } from "lucide-react";
import { toFavoriteCardViewModel } from "./favoriteCardViewModel";
import type { SavedFavorite } from "@/hooks/useFavorites";
import { RecipeCard } from "@/components/recipe/RecipeCard";

interface FavoriteCardProps {
  favorite: SavedFavorite;
  onTap: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  index?: number;
  isPremium?: boolean;
  members: Array<{ id: string; name?: string; age_months?: number | null }>;
  onAddToPlan?: () => void;
}

const MAX_INGREDIENT_CHIPS = 3;

export function FavoriteCard({ favorite, onTap, onToggleFavorite, index = 0, isPremium = false, members, onAddToPlan }: FavoriteCardProps) {
  const vm = toFavoriteCardViewModel(favorite.recipe);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <RecipeCard
        variant="preview"
        header={{
          mealLabel: vm.mealTypeLabel,
          cookingTimeMinutes: vm.cookingTimeMinutes,
          title: vm.title,
        }}
        ingredients={vm.ingredientNames}
        maxIngredientChips={MAX_INGREDIENT_CHIPS}
        hint={vm.hint}
        onClick={onTap}
        actions={
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(e);
              }}
              className="h-8 w-8 rounded-full flex items-center justify-center text-primary bg-primary/10 border border-primary/20 hover:opacity-90 active:scale-95 transition-all shrink-0"
              aria-label="Убрать из избранного"
            >
              <Heart className="h-4 w-4 fill-primary" />
            </button>
            {onAddToPlan && (
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
