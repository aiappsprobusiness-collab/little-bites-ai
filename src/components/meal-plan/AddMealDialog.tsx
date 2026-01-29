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
import type { FavoriteItem } from "@/store/useAppStore";

export interface MealTypeOption {
  id: string;
  label: string;
  emoji: string;
  time: string;
}

interface AddMealDialogProps {
  recipes?: any[];
  chatRecipes?: any[];
  favorites?: FavoriteItem[];
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

  // Фильтруем рецепты из чата - показываем все рецепты с тегом 'chat'
  // независимо от типа приема пищи (пользователь может выбрать любой тип)
  const filteredChatRecipes = (chatRecipes || []).filter(recipe => {
    if (!recipe) {
      return false;
    }

    if (!recipe.tags || !Array.isArray(recipe.tags)) {
      return false;
    }

    const hasChatTag = recipe.tags.includes('chat');
    if (!hasChatTag) {
      return false;
    }

    // Показываем все рецепты из чата, независимо от типа приема пищи
    // Пользователь может выбрать любой тип приема пищи для любого рецепта
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
          <label className="text-sm font-medium">Тип приема пищи</label>
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
              {mealTypesOptions.map((mt) => (
                <SelectItem key={mt.id} value={mt.id}>
                  {mt.emoji} {mt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Рецепт</label>
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
              {favorites.length > 0 || filteredChatRecipes.length > 0 ? (
                <>
                  {/* Избранное */}
                  {favorites.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b">
                        ❤️ Избранное
                      </div>
                      {favorites.map((favorite) => (
                        <SelectItem key={favorite.id} value={`favorite_${favorite.id}`}>
                          {favorite.recipe.title}
                        </SelectItem>
                      ))}
                    </>
                  )}

                  {/* История генераций чата */}
                  {filteredChatRecipes.length > 0 && (
                    <>
                      {favorites.length > 0 && (
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t border-b mt-1">
                          💬 История генераций чата
                        </div>
                      )}
                      {!favorites.length && (
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b">
                          💬 История генераций чата
                        </div>
                      )}
                      {filteredChatRecipes.map((recipe) => (
                        <SelectItem key={recipe.id} value={recipe.id}>
                          {recipe.title}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Нет доступных рецептов
                </div>
              )}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          variant="mint"
          className="w-full"
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
