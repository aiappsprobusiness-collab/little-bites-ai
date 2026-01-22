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
    <MobileLayout title="Рецепт">
      <div className="space-y-6 pb-6 px-4">
        {/* Название рецепта */}
        <section>
          <h1 className="text-2xl font-bold">{recipe.title}</h1>
          {recipe.description && !recipe.description.startsWith("Сгенерировано") && (
            <p className="text-muted-foreground mt-2">{recipe.description}</p>
          )}
        </section>

        {/* Ингредиенты */}
        {ingredients.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Ингредиенты
            </h2>
            <ul className="space-y-2">
              {ingredients.map((ing: any, index: number) => (
                <li key={index} className="flex items-start gap-3">
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
          </section>
        )}

        {/* Шаги приготовления */}
        {steps.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Шаги приготовления
            </h2>
            <ol className="space-y-4">
              {steps.map((step: any, index: number) => (
                <li key={index} className="flex gap-4">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                    {step.step_number || index + 1}
                  </span>
                  <p className="pt-0.5">{step.instruction}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </MobileLayout>
  );
}
