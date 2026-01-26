import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, ChefHat, Loader2 } from "lucide-react";
import { useFavorites } from "@/hooks/useFavorites";
import { useToast } from "@/hooks/use-toast";

export default function FavoritesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { favorites, isLoading, removeFavorite, isRemoving } = useFavorites();

  const handleRemove = async (id: string) => {
    try {
      await removeFavorite(id);
      toast({
        title: "Удалено из избранного",
        description: "Рецепт удален из списка избранного",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось удалить рецепт",
      });
    }
  };

  if (isLoading) {
    return (
      <MobileLayout title="Избранное">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="Избранное">
      <div className="px-4 pt-6 space-y-4">
        {favorites.length === 0 ? (
          <Card variant="default" className="p-8 text-center">
            <CardContent className="p-0">
              <ChefHat className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-bold mb-2">Нет избранных рецептов</h3>
              <p className="text-muted-foreground">
                Добавьте рецепты в избранное из чата или других страниц
              </p>
            </CardContent>
          </Card>
        ) : (
          favorites.map((favorite, index) => (
            <motion.div
              key={favorite.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card variant="elevated" className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-bold text-lg mb-1">{favorite.recipe.title}</h3>
                      {favorite.recipe.description && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {favorite.recipe.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {favorite.recipe.cookingTime && (
                          <span>⏱️ {favorite.recipe.cookingTime} мин</span>
                        )}
                        {favorite.recipe.ageRange && (
                          <span>👶 {favorite.recipe.ageRange}</span>
                        )}
                        {favorite.memberIds.length > 0 && (
                          <span>👨‍👩‍👧‍👦 {favorite.memberIds.length} участник(ов)</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Можно добавить навигацию к рецепту, если он сохранён в базе
                          toast({
                            title: "Рецепт",
                            description: "Просмотр рецепта из избранного",
                          });
                        }}
                      >
                        Открыть
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(favorite.id)}
                        disabled={isRemoving}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </MobileLayout>
  );
}
