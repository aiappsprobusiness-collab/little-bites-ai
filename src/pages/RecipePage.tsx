import { useParams, useNavigate } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Loader2 } from "lucide-react";
import { useRecipes } from "@/hooks/useRecipes";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getRecipeById } = useRecipes();
  const { data: recipe, isLoading, error } = getRecipeById(id || "");

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
    <MobileLayout title="">
      <div className="space-y-6 pb-6 px-4">
        {/* Название рецепта */}
        <section className="text-center pt-2">
          <h1 className="text-2xl font-bold">{recipe.title}</h1>
          {recipe.description && !recipe.description.startsWith("Сгенерировано") && (
            <p className="text-muted-foreground mt-2">{recipe.description}</p>
          )}
        </section>

        {/* Ингредиенты */}
        {ingredients.length > 0 && (
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4 text-center">
                🥗 Ингредиенты
              </h2>
              <ul className="space-y-3">
                {ingredients.map((ing: any, index: number) => (
                  <li key={index} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <span className="font-medium">{ing.name}</span>
                    {ing.amount && ing.unit && (
                      <span className="text-muted-foreground text-sm bg-muted/50 px-2 py-1 rounded-full">
                        {ing.amount} {ing.unit}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Шаги приготовления */}
        {steps.length > 0 && (
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4 text-center">
                👨‍🍳 Приготовление
              </h2>
              <ol className="space-y-4">
                {steps.map((step: any, index: number) => (
                  <li key={index} className="flex gap-4 items-start">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-sm font-bold shadow-md">
                      {step.step_number || index + 1}
                    </span>
                    <p className="pt-1 text-foreground/90 leading-relaxed">{step.instruction}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
      </div>
    </MobileLayout>
  );
}
