import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SavedFavorite } from "@/hooks/useFavorites";

export interface MealTypeOption {
  id: string;
  label: string;
  emoji: string;
  time: string;
}

interface AddMealDialogProps {
  recipes?: any[];
  chatRecipes?: any[];
  favorites?: SavedFavorite[];
  mealTypes: MealTypeOption[];
  selectedMealType: string | null;
  onSelectMealType: (type: string) => void;
  onAdd: (recipeId: string, mealType: string) => void;
  onAddFromFavorite?: (favoriteId: string, mealType: string) => void;
  isLoading: boolean;
}

export function AddMealDialog({
  recipes = [],
  chatRecipes = [],
  favorites = [],
  mealTypes: mealTypesOptions,
  selectedMealType,
  onSelectMealType,
  onAdd,
  onAddFromFavorite,
  isLoading,
}: AddMealDialogProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("");
  const [selectedFavoriteId, setSelectedFavoriteId] = useState<string>("");
  // Используем selectedMealType напрямую, с fallback на первый тип (Завтрак)
  // Важно: используем вычисляемое значение, которое обновляется при изменении selectedMealType
  const currentMealType = selectedMealType || mealTypesOptions[0]?.id || "breakfast";

  // Фильтруем рецепты из чата — только с тегом 'chat', исключаем дубликаты из recipes
  const recipeIds = new Set((recipes || []).map((r) => r.id));
  const favoriteRecipeIds = new Set((favorites || []).map((f) => f.recipe?.id ?? f.recipe_id).filter(Boolean));
  const filteredChatRecipes = (chatRecipes || []).filter((recipe) => {
    if (!recipe?.id) return false;
    if (!recipe.tags || !Array.isArray(recipe.tags) || !recipe.tags.includes("chat")) return false;
    if (recipeIds.has(recipe.id) || favoriteRecipeIds.has(recipe.id)) return false;
    return true;
  });

  // Сбрасываем выбранный рецепт при изменении типа приема пищи
  useEffect(() => {
    setSelectedRecipeId("");
    setSelectedFavoriteId("");
  }, [selectedMealType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFavoriteId && onAddFromFavorite) {
      // Добавляем из избранного
      onAddFromFavorite(selectedFavoriteId, currentMealType);
      setSelectedFavoriteId("");
    } else if (selectedRecipeId) {
      // Добавляем обычный рецепт
      onAdd(selectedRecipeId, currentMealType);
      setSelectedRecipeId("");
    }
  };

  const hasSelection = selectedRecipeId || selectedFavoriteId;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Добавить блюдо</DialogTitle>
        <DialogDescription>
          Выберите рецепт для добавления в план питания
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-typo-muted font-medium">Тип приема пищи</label>
          <Select
            value={currentMealType}
            onValueChange={(value) => {
              onSelectMealType(value);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {mealTypesOptions.map((mt, idx) => (
                <SelectItem key={`${mt.id}-${idx}`} value={mt.id}>
                  {mt.emoji} {mt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-typo-muted font-medium">Рецепт</label>
          <Select
            value={selectedFavoriteId ? `favorite_${selectedFavoriteId}` : selectedRecipeId}
            onValueChange={(value) => {
              if (value.startsWith('favorite_')) {
                setSelectedFavoriteId(value.replace('favorite_', ''));
                setSelectedRecipeId("");
              } else {
                setSelectedRecipeId(value);
                setSelectedFavoriteId("");
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите рецепт" />
            </SelectTrigger>
            <SelectContent>
              {recipes.length > 0 || favorites.length > 0 || filteredChatRecipes.length > 0 ? (
                <>
                  {/* Сохранённые рецепты */}
                  {recipes.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-typo-caption font-semibold text-muted-foreground border-b">
                        📖 Сохранённые рецепты
                      </div>
                      {recipes.map((recipe, idx) => (
                        <SelectItem key={`saved-${recipe.id}-${idx}`} value={recipe.id}>
                          {recipe.title}
                        </SelectItem>
                      ))}
                    </>
                  )}

                  {/* Избранное */}
                  {favorites.length > 0 && (
                    <>
                      <div className={`px-2 py-1.5 text-typo-caption font-semibold text-muted-foreground border-b ${recipes.length > 0 ? 'border-t mt-1' : ''}`}>
                        ❤️ Избранное
                      </div>
                      {favorites.map((favorite, idx) => (
                        <SelectItem key={`favorite-${favorite.id}-${idx}`} value={`favorite_${favorite.id}`}>
                          {favorite.recipe.title}
                        </SelectItem>
                      ))}
                    </>
                  )}

                  {/* История генераций чата */}
                  {filteredChatRecipes.length > 0 && (
                    <>
                      <div className={`px-2 py-1.5 text-typo-caption font-semibold text-muted-foreground border-b ${(recipes.length > 0 || favorites.length > 0) ? 'border-t mt-1' : ''}`}>
                        💬 История генераций чата
                      </div>
                      {filteredChatRecipes.map((recipe, idx) => (
                        <SelectItem key={`chat-${recipe.id}-${idx}`} value={recipe.id}>
                          {recipe.title}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <div className="p-4 text-center text-typo-muted text-muted-foreground">
                  Нет доступных рецептов
                </div>
              )}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          className="w-full bg-primary hover:opacity-90 text-white border-0"
          disabled={isLoading || !hasSelection}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Добавление...
            </>
          ) : (
            "Добавить"
          )}
        </Button>
      </form>
    </DialogContent>
  );
}
