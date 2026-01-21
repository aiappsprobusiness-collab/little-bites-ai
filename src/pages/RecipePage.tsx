import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, Clock, Baby, Loader2, Edit2, Heart, Trash2 } from "lucide-react";
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
    <MobileLayout title={recipe.title}>
      <div className="space-y-6">
        {/* Recipe Image */}
        {recipe.image_url && (
          <div className="relative aspect-[4/3] overflow-hidden -mx-4">
            <img
              src={recipe.image_url}
              alt={recipe.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="px-4 space-y-6">
          {/* Recipe Header */}
          <div>
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h1 className="text-2xl font-bold mb-2">{recipe.title}</h1>
                {recipe.description && (
                  <p className="text-muted-foreground">{recipe.description}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleToggleFavorite}
                className="flex-shrink-0"
              >
                <Heart
                  className={`w-6 h-6 ${
                    recipe.is_favorite
                      ? "fill-peach-dark text-peach-dark"
                      : "text-muted-foreground"
                  }`}
                />
              </Button>
            </div>

            {/* Recipe Info */}
            <div className="flex flex-wrap gap-4 text-sm">
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
          </div>

          {/* Ingredients */}
          {ingredients.length > 0 && (
            <Card variant="mint">
              <CardContent className="p-5">
                <h2 className="text-lg font-bold mb-4">Ингредиенты</h2>
                <ul className="space-y-2">
                  {ingredients.map((ing: any, index: number) => (
                    <li key={index} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      <span className="flex-1">
                        {ing.name}
                        {ing.amount && ing.unit && (
                          <span className="text-muted-foreground ml-2">
                            - {ing.amount} {ing.unit}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Steps */}
          {steps.length > 0 && (
            <Card variant="default">
              <CardContent className="p-5">
                <h2 className="text-lg font-bold mb-4">Приготовление</h2>
                <ol className="space-y-4">
                  {steps.map((step: any, index: number) => (
                    <li key={index} className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        {step.step_number || index + 1}
                      </div>
                      <div className="flex-1 pt-1">
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
          )}

          {/* Actions */}
          <div className="flex gap-3 pb-6">
            <Button
              variant="mint"
              className="flex-1"
              onClick={() => navigate(`/recipe/${recipe.id}/edit`)}
            >
              <Edit2 className="w-4 h-4 mr-2" />
              Редактировать
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </MobileLayout>
  );
}
