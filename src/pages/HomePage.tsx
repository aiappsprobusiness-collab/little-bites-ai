import { useState } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { ChildProfileCard } from "@/components/profile/ChildProfileCard";
import { ChefHat, Sparkles, TrendingUp, Heart, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useChildren } from "@/hooks/useChildren";
import { useRecipes } from "@/hooks/useRecipes";
import { useGigaChat } from "@/hooks/useGigaChat";

const quickActions = [
  { icon: ChefHat, label: "Новый рецепт", color: "mint", path: "/recipe/new" },
  { icon: Sparkles, label: "Сканировать", color: "peach", path: "/scan" },
  { icon: TrendingUp, label: "План питания", color: "lavender", path: "/meal-plan" },
  { icon: Heart, label: "Список покупок", color: "soft-pink", path: "/shopping" },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { children, isLoading: isLoadingChildren, formatAge } = useChildren();
  const { recentRecipes, isLoading: isLoadingRecipes } = useRecipes();
  const { recommendation, isLoadingRecommendation } = useGigaChat();
  
  const selectedChild = children[0]; // Берем первого ребенка или можно добавить выбор

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  // Форматируем рецепты для отображения
  const formattedRecipes = recentRecipes.slice(0, 4).map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    image: recipe.image_url || "https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?w=400&h=300&fit=crop",
    cookTime: recipe.cooking_time_minutes ? `${recipe.cooking_time_minutes} мин` : "—",
    ageRange: recipe.min_age_months ? `${recipe.min_age_months}+ мес` : "—",
    rating: recipe.rating ? recipe.rating / 1 : undefined,
    isFavorite: recipe.is_favorite || false,
  }));

  return (
    <MobileLayout>
      <div className="px-4 pt-6 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold">Привет! 👋</h1>
            <p className="text-muted-foreground">
              Что приготовим сегодня для малыша?
            </p>
          </div>
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-2xl">
            🍼
          </div>
        </motion.div>

        {/* Child Profile */}
        {isLoadingChildren ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : selectedChild ? (
          <ChildProfileCard
            name={selectedChild.name}
            age={formatAge(selectedChild.birth_date)}
            avatarEmoji={selectedChild.avatar_url || "👶"}
            allergies={selectedChild.allergies || []}
            recipesCount={recentRecipes.length}
            onClick={() => navigate("/profile")}
          />
        ) : (
          <Card variant="mint" className="p-5">
            <CardContent className="p-0">
              <p className="text-center text-muted-foreground mb-4">
                Добавьте профиль ребенка, чтобы начать
              </p>
              <Button
                variant="mint"
                className="w-full"
                onClick={() => navigate("/profile")}
              >
                Добавить ребенка
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-4 gap-3"
        >
          {quickActions.map((action) => (
            <motion.div key={action.label} variants={item}>
              <button
                onClick={() => navigate(action.path)}
                className="w-full flex flex-col items-center gap-2 p-3 rounded-2xl bg-card shadow-soft hover:shadow-card transition-all"
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    action.color === "mint"
                      ? "gradient-primary"
                      : action.color === "peach"
                      ? "gradient-peach"
                      : action.color === "lavender"
                      ? "gradient-lavender"
                      : "bg-soft-pink"
                  }`}
                >
                  <action.icon className="w-6 h-6 text-foreground/80" />
                </div>
                <span className="text-xs font-medium text-center leading-tight">
                  {action.label}
                </span>
              </button>
            </motion.div>
          ))}
        </motion.div>

        {/* Recent Recipes */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Недавние рецепты</h2>
            {recentRecipes.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/recipes")}>
                Все →
              </Button>
            )}
          </div>
          {isLoadingRecipes ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : formattedRecipes.length > 0 ? (
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 gap-3"
            >
              {formattedRecipes.map((recipe) => (
                <motion.div key={recipe.id} variants={item}>
                  <RecipeCard
                    {...recipe}
                    onClick={() => navigate(`/recipe/${recipe.id}`)}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <Card variant="default" className="p-5">
              <CardContent className="p-0 text-center">
                <p className="text-muted-foreground mb-4">
                  У вас пока нет рецептов
                </p>
                <Button
                  variant="mint"
                  onClick={() => navigate("/scan")}
                >
                  <ChefHat className="w-4 h-4 mr-2" />
                  Создать первый рецепт
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* AI Tip Card */}
        {selectedChild && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card variant="peach" className="overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-card/50 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-secondary-foreground" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold mb-1">Совет от ИИ (GigaChat)</h3>
                    {isLoadingRecommendation ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <p className="text-sm text-secondary-foreground/80">Загружаем рекомендацию...</p>
                      </div>
                    ) : recommendation ? (
                      <p className="text-sm text-secondary-foreground/80">{recommendation}</p>
                    ) : (
                      <p className="text-sm text-secondary-foreground/80">
                        {(() => {
                          const ageMonths = selectedChild ? Math.floor((new Date().getTime() - new Date(selectedChild.birth_date).getTime()) / (1000 * 60 * 60 * 24 * 30.44)) : 0;
                          if (ageMonths < 6) {
                            return "Для малышей до 6 месяцев идеально подходит грудное молоко или смесь. Скоро можно будет вводить первый прикорм!";
                          } else if (ageMonths < 12) {
                            return "В этом возрасте отлично подойдут пюреобразные блюда. Начните с овощных и фруктовых пюре!";
                          } else {
                            return "В этом возрасте отлично подойдут текстурные блюда. Попробуйте мягкие кусочки овощей для развития жевательных навыков!";
                          }
                        })()}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </MobileLayout>
  );
}
