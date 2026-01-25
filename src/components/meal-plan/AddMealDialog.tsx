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

export interface MealTypeOption {
  id: string;
  label: string;
  emoji: string;
  time: string;
}

interface AddMealDialogProps {
  recipes?: any[];
  chatRecipes?: any[];
  mealTypes: MealTypeOption[];
  selectedMealType: string | null;
  onSelectMealType: (type: string) => void;
  onAdd: (recipeId: string, mealType: string) => void;
  isLoading: boolean;
}

export function AddMealDialog({
  recipes = [],
  chatRecipes = [],
  mealTypes: mealTypesOptions,
  selectedMealType,
  onSelectMealType,
  onAdd,
  isLoading,
}: AddMealDialogProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("");
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
  
  // Объединяем обычные рецепты и рецепты из чата
  // Рецепты из чата показываем первыми
  const regularRecipes = (recipes || []).filter(r => !r.tags || !Array.isArray(r.tags) || !r.tags.includes('chat'));
  const allRecipes = [...filteredChatRecipes, ...regularRecipes];

  // Сбрасываем выбранный рецепт при изменении типа приема пищи
  useEffect(() => {
    setSelectedRecipeId("");
  }, [selectedMealType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRecipeId) {
      // Используем текущее значение типа приема пищи
      onAdd(selectedRecipeId, currentMealType);
      // Сбрасываем форму после отправки
      setSelectedRecipeId("");
    }
  };

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
          <Select value={selectedRecipeId} onValueChange={setSelectedRecipeId}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите рецепт" />
            </SelectTrigger>
            <SelectContent>
              {allRecipes.length > 0 ? (
                <>
                  {filteredChatRecipes.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b">
                        Из чата (сегодня)
                      </div>
                      {filteredChatRecipes.map((recipe) => (
                        <SelectItem key={recipe.id} value={recipe.id}>
                          💬 {recipe.title}
                        </SelectItem>
                      ))}
                      {regularRecipes.length > 0 && (
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t border-b mt-1">
                          Мои рецепты
                        </div>
                      )}
                    </>
                  )}
                  {regularRecipes.map((recipe) => (
                    <SelectItem key={recipe.id} value={recipe.id}>
                      {recipe.title}
                    </SelectItem>
                  ))}
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
          disabled={isLoading || !selectedRecipeId}
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
