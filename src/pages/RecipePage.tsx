import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, Clock, Baby, Loader2, Heart } from "lucide-react";
import { useRecipes } from "@/hooks/useRecipes";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getRecipeById, toggleFavorite, deleteRecipe } = useRecipes();
  const { data: recipe, isLoading, error } = getRecipeById(id || "");

  const handleToggleFavorite = async () => {
    if (!recipe) return;
    try {
      await toggleFavorite({
        id: recipe.id,
        isFavorite: !recipe.is_favorite,
      });
      toast({
        title: recipe.is_favorite ? "Удалено из избранного" : "Добавлено в избранное",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    }
  };

  const handleDelete = async () => {
    if (!recipe || !confirm("Вы уверены, что хотите удалить этот рецепт?")) return;
    try {
      await deleteRecipe(recipe.id);
      toast({
        title: "Рецепт удален",
      });
      navigate("/");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    }
  };

  if (isLoading) {
    return (
      <MobileLayout title="Рецепт">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  if (error || !recipe) {
    return (
      <MobileLayout title="Рецепт">
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <Card variant="default" className="p-8 text-center">
            <CardContent className="p-0">
              <p className="text-muted-foreground mb-4">Рецепт не найден</p>
              <Button variant="mint" onClick={() => navigate("/")}>
                Вернуться на главную
              </Button>
            </CardContent>
          </Card>
        </div>
      </MobileLayout>
    );
  }

  const ingredients = (recipe as any).ingredients || [];
  const steps = (recipe as any).steps || [];

  return (
    <MobileLayout title="Рецепт">
      <div className="flex flex-col h-full overflow-y-auto px-4 py-6 space-y-6">
        {/* Название рецепта */}
        <section>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold text-foreground">{recipe.title}</h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleFavorite}
              className="flex-shrink-0"
            >
              <Heart
                className={`w-5 h-5 ${
                  recipe.is_favorite
                    ? "fill-peach-dark text-peach-dark"
                    : "text-muted-foreground"
                }`}
              />
            </Button>
          </div>
          
          {/* Мета-информация */}
          <div className="flex flex-wrap gap-4 text-sm mt-3">
            {recipe.cooking_time_minutes && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>{recipe.cooking_time_minutes} мин</span>
              </div>
            )}
            {recipe.min_age_months && (
              <div className="flex items-center gap-2">
                <Baby className="w-4 h-4 text-muted-foreground" />
                <span>С {recipe.min_age_months} мес</span>
              </div>
            )}
            {recipe.rating && (
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-peach-dark fill-peach-dark" />
                <span>{recipe.rating}/5</span>
              </div>
            )}
          </div>

          {recipe.description && (
            <p className="text-muted-foreground mt-3">{recipe.description}</p>
          )}
        </section>

        {/* Ингредиенты */}
        {ingredients.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-foreground mb-3">Ингредиенты</h2>
            <Card variant="mint">
              <CardContent className="p-4">
                <ul className="space-y-2">
                  {ingredients.map((ing: any, index: number) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <span>
                        {ing.name}
                        {ing.amount && ing.unit && (
                          <span className="text-muted-foreground ml-1">
                            — {ing.amount} {ing.unit}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Шаги приготовления */}
        {steps.length > 0 && (
          <section className="pb-6">
            <h2 className="text-lg font-bold text-foreground mb-3">Шаги приготовления</h2>
            <Card variant="default">
              <CardContent className="p-4">
                <ol className="space-y-4">
                  {steps.map((step: any, index: number) => (
                    <li key={index} className="flex gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                        {step.step_number || index + 1}
                      </div>
                      <div className="flex-1 pt-0.5">
                        <p>{step.instruction}</p>
                        {step.duration_minutes && (
                          <p className="text-sm text-muted-foreground mt-1">
                            ⏱ {step.duration_minutes} мин
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </MobileLayout>
  );
}
