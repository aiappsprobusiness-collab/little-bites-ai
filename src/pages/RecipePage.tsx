import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Loader2, Lock } from "lucide-react";
import { useRecipes } from "@/hooks/useRecipes";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppStore } from "@/store/useAppStore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getIngredientEmoji } from "@/utils/ingredientEmojis";

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getRecipeById } = useRecipes();
  const { isPremium } = useSubscription();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
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
  const chefAdvice = (recipe as any).chefAdvice;

  const cardWrapperClass = isPremium
    ? "bg-white rounded-[32px] shadow-sm"
    : "bg-white rounded-2xl border border-slate-200";

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

        {/* Ингредиенты: Premium — плашки, Free — список */}
        {ingredients.length > 0 && (
          <Card className={cardWrapperClass}>
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4 text-center flex items-center justify-center gap-2">
                <span className="text-xl">🥗</span>
                <span>Ингредиенты</span>
                <span className="text-xl">🥗</span>
              </h2>
              {isPremium ? (
                <ul className="space-y-2.5">
                  {ingredients.map((ing: { name: string; amount?: number | null; unit?: string | null; substitute?: string | null }, index: number) => {
                    const emoji = getIngredientEmoji(ing.name);
                    const hasSubstitute = !!ing.substitute?.trim();
                    return (
                      <motion.li
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center gap-3 py-2.5 px-3 rounded-2xl bg-slate-50/50 border border-slate-100"
                      >
                        <span className="text-2xl flex-shrink-0" role="img" aria-label={ing.name}>
                          {emoji}
                        </span>
                        <span className="font-medium flex-1 text-foreground/90">{ing.name}</span>
                        {ing.amount && ing.unit && (
                          <span className="text-muted-foreground text-sm bg-primary/10 text-primary font-semibold px-3 py-1 rounded-full">
                            {ing.amount} {ing.unit}
                          </span>
                        )}
                        {hasSubstitute ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="shrink-0 rounded-full text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                aria-label="Заменить"
                              >
                                ЗАМЕНИТЬ 🔄
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent side="left" className="max-w-[280px]">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Чем заменить:</p>
                              <p className="text-sm">{ing.substitute}</p>
                            </PopoverContent>
                          </Popover>
                        ) : null}
                      </motion.li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="list-disc list-inside space-y-1 text-sm text-foreground/90">
                  {ingredients.map((ing: unknown, index: number) => {
                    const isStr = typeof ing === "string";
                    const name = isStr ? ing : (ing as { name?: string }).name ?? "";
                    const amount = (ing as { amount?: number | null }).amount;
                    const unit = (ing as { unit?: string }).unit?.trim() || "";
                    const text = isStr ? name : (unit ? `${name} ${amount ?? ""} ${unit}`.trim() : name);
                    const hasSubstitute = !!(ing as { substitute?: string }).substitute?.trim();
                    return (
                      <li key={index} className="flex items-center justify-between gap-2">
                        <span>{text}</span>
                        {hasSubstitute && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 rounded-full text-muted-foreground hover:bg-muted h-8 gap-1"
                            onClick={() => setShowPaywall(true)}
                          >
                            <Lock className="w-3.5 h-3.5" />
                            Заменить
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {/* Шаги приготовления */}
        {steps.length > 0 && (
          <Card className={cardWrapperClass}>
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4 text-center">
                👨‍🍳 Приготовление
              </h2>
              <ol className="space-y-4">
                {steps.map((step: any, index: number) => (
                  <li key={index} className="flex gap-4 items-start">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      {step.step_number || index + 1}
                    </span>
                    <p className="pt-1 text-foreground/90 leading-relaxed">{step.instruction}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        {/* Секрет шефа: Premium — оливковый фон, Free — «Доступно в Premium» */}
        {isPremium && chefAdvice ? (
          <div className="rounded-2xl p-4 text-sm" style={{ backgroundColor: "#F1F5E9" }}>
            <p className="font-semibold text-foreground/90 mb-1">Секрет шефа</p>
            <p className="text-foreground/80 leading-relaxed">{chefAdvice}</p>
          </div>
        ) : (
          <div className="rounded-2xl p-4 border border-slate-200 bg-slate-50/50 text-center">
            <p className="text-sm text-muted-foreground">Секрет шефа</p>
            <p className="text-xs text-muted-foreground mt-1">Доступно в Premium</p>
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
