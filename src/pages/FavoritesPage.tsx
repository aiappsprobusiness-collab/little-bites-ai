import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, ChefHat, MessageCircle, Clock } from "lucide-react";
import { useFavorites } from "@/hooks/useFavorites";
import { useToast } from "@/hooks/use-toast";

export default function FavoritesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { favorites, removeFavorite } = useFavorites();

  const handleRemove = async (id: string) => {
    try {
      await removeFavorite(id);
      toast({ title: "Удалено из избранного" });
    } catch (e: unknown) {
      console.error("DB Error in FavoritesPage handleRemove:", (e as Error).message);
      toast({ title: "Не удалось удалить", variant: "destructive" });
    }
  };

  return (
    <MobileLayout title="Избранное">
      <div className="px-4 pt-6 pb-24 space-y-4">
        {favorites.length === 0 ? (
          <Card variant="default" className="p-8 text-center">
            <CardContent className="p-0">
              <ChefHat className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-bold mb-2">Нет избранных рецептов</h3>
              <p className="text-muted-foreground mb-4">
                Добавьте рецепты в избранное из чата
              </p>
              <Button onClick={() => navigate("/chat")} variant="default" className="gap-2">
                <MessageCircle className="w-4 h-4" />
                Перейти в чат
              </Button>
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
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-lg">{favorite.recipe.title}</h3>
                      {favorite.recipe.child_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">Для: {favorite.recipe.child_name}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(favorite.id)}
                      className="text-destructive hover:text-destructive shrink-0"
                      aria-label="Удалить из избранного"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  {favorite.recipe.description && (
                    <p className="text-sm text-muted-foreground italic">
                      {favorite.recipe.description}
                    </p>
                  )}
                  {favorite.recipe.cookingTime ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span>Время: {favorite.recipe.cookingTime} мин</span>
                    </div>
                  ) : null}
                  {favorite.recipe.ingredients && favorite.recipe.ingredients.length > 0 && (
                    <div>
                      <p className="font-semibold text-sm mb-2">🛒 Ингредиенты</p>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        {favorite.recipe.ingredients.map((ing, i) => (
                          <li key={i}>{ing}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {favorite.recipe.steps && favorite.recipe.steps.length > 0 && (
                    <div>
                      <p className="font-semibold text-sm mb-2">👨‍🍳 Приготовление</p>
                      <ol className="list-decimal list-inside space-y-2 text-sm">
                        {favorite.recipe.steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </MobileLayout>
  );
}
