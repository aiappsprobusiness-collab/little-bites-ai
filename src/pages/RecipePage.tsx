import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Loader2 } from "lucide-react";
import { useRecipes } from "@/hooks/useRecipes";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getIngredientEmoji } from "@/utils/ingredientEmojis";

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
              <Button variant="mint" onClick={() => navigate("/home")}>
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

  const ingredientStrings = ingredients.map((ing: { name: string; amount?: number | null; unit?: string | null }) => {
    const a = ing.amount != null ? String(ing.amount) : "";
    const u = ing.unit?.trim() || "";
    return u ? `${ing.name} ${a} ${u}`.trim() : ing.name;
  });

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
              <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4 text-center flex items-center justify-center gap-2">
                <span className="text-xl">🥗</span>
                <span>Ингредиенты</span>
                <span className="text-xl">🥗</span>
              </h2>
              <ul className="space-y-2.5">
                {ingredients.map((ing: any, index: number) => {
                  const emoji = getIngredientEmoji(ing.name);
                  return (
                    <motion.li
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-gradient-to-r from-card/80 to-card/40 border border-border/30 hover:border-primary/30 transition-all"
                    >
                      <span className="text-2xl flex-shrink-0" role="img" aria-label={ing.name}>
                        {emoji}
                      </span>
                      <span className="font-medium flex-1 text-foreground/90">{ing.name}</span>
                      {ing.amount && ing.unit && (
                        <span className="text-muted-foreground text-sm bg-primary/10 text-primary font-semibold px-3 py-1 rounded-full border border-primary/20">
                          {ing.amount} {ing.unit}
                        </span>
                      )}
                    </motion.li>
                  );
                })}
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
