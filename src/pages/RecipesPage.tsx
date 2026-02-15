import { useState } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { RecipeListItem } from "@/components/recipes/RecipeListItem";
import { Loader2, LayoutGrid, List, Grid3x3, Square } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRecipes } from "@/hooks/useRecipes";
import { useFavorites } from "@/hooks/useFavorites";
import { useFamily } from "@/contexts/FamilyContext";
import { Button } from "@/components/ui/button";

type ViewMode = 'list' | 'large' | 'medium' | 'small';

export default function RecipesPage() {
  const navigate = useNavigate();
  const { recipes, isLoading } = useRecipes();
  const { favoriteRecipeIds } = useFavorites();
  const { selectedMember } = useFamily();
  const [viewMode, setViewMode] = useState<ViewMode>('medium');

  // Фильтруем рецепты - исключаем рецепты из чата (они показываются только в плане питания)
  const recipesWithoutChat = (recipes || []).filter(r => !r.tags || !Array.isArray(r.tags) || !r.tags.includes('chat'));

  // Форматируем рецепты для отображения
  const formattedRecipes = recipesWithoutChat.map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    image: recipe.image_url || "https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?w=400&h=300&fit=crop",
    cookTime: recipe.cooking_time_minutes ? `${recipe.cooking_time_minutes} мин` : "—",
    childName: selectedMember?.name || "—",
    rating: recipe.rating ? recipe.rating / 1 : undefined,
    isFavorite: favoriteRecipeIds.has(recipe.id),
  }));

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  // Определяем классы сетки в зависимости от режима просмотра
  const getGridClasses = () => {
    switch (viewMode) {
      case 'list':
        return 'space-y-2';
      case 'large':
        return 'grid grid-cols-1 gap-4';
      case 'medium':
        return 'grid grid-cols-2 gap-3';
      case 'small':
        return 'grid grid-cols-3 gap-2';
      default:
        return 'grid grid-cols-2 gap-3';
    }
  };

  // Определяем размер карточки
  const getCardSize = (): 'small' | 'medium' | 'large' => {
    switch (viewMode) {
      case 'large':
        return 'large';
      case 'small':
        return 'small';
      default:
        return 'medium';
    }
  };

  return (
    <MobileLayout title="Все рецепты">
      <div className="px-4 pb-6">
        {/* Переключатель видов отображения */}
        <div className="flex items-center justify-end gap-2 mb-4">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-2"
              onClick={() => setViewMode('list')}
            >
              <List className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'large' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-2"
              onClick={() => setViewMode('large')}
            >
              <Square className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'medium' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-2"
              onClick={() => setViewMode('medium')}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'small' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-2"
              onClick={() => setViewMode('small')}
            >
              <Grid3x3 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : formattedRecipes.length > 0 ? (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className={getGridClasses()}
          >
            {formattedRecipes.map((recipe) => (
              <motion.div key={recipe.id} variants={item}>
                {viewMode === 'list' ? (
                  <RecipeListItem
                    {...recipe}
                    onClick={() => navigate(`/recipe/${recipe.id}`)}
                  />
                ) : (
                  <RecipeCard
                    {...recipe}
                    size={getCardSize()}
                    onClick={() => navigate(`/recipe/${recipe.id}`)}
                  />
                )}
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-4">
              У вас пока нет рецептов
            </p>
            <button
              onClick={() => navigate("/scan")}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium"
            >
              Создать первый рецепт
            </button>
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
