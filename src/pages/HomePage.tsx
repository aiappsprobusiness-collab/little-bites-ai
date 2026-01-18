import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { ChildProfileCard } from "@/components/profile/ChildProfileCard";
import { ChefHat, Sparkles, TrendingUp, Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Mock data
const mockChild = {
  name: "Миша",
  age: "1 год 3 месяца",
  avatarEmoji: "👶",
  allergies: ["Глютен", "Молоко"],
  recipesCount: 24,
};

const mockRecipes = [
  {
    id: "1",
    title: "Пюре из тыквы с яблоком",
    image: "https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?w=400&h=300&fit=crop",
    cookTime: "20 мин",
    ageRange: "6+ мес",
    rating: 4.8,
    isFavorite: true,
  },
  {
    id: "2",
    title: "Каша рисовая с грушей",
    image: "https://images.unsplash.com/photo-1517673132405-a56a62b18caf?w=400&h=300&fit=crop",
    cookTime: "15 мин",
    ageRange: "8+ мес",
    rating: 4.5,
  },
  {
    id: "3",
    title: "Овощное рагу с индейкой",
    image: "https://images.unsplash.com/photo-1547592180-85f173990554?w=400&h=300&fit=crop",
    cookTime: "35 мин",
    ageRange: "12+ мес",
    rating: 4.9,
    isFavorite: true,
  },
  {
    id: "4",
    title: "Банановые оладьи без яиц",
    image: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=300&fit=crop",
    cookTime: "25 мин",
    ageRange: "10+ мес",
    rating: 4.7,
  },
];

const quickActions = [
  { icon: ChefHat, label: "Новый рецепт", color: "mint", path: "/scan" },
  { icon: Sparkles, label: "ИИ подбор", color: "peach", path: "/ai-suggest" },
  { icon: TrendingUp, label: "Популярное", color: "lavender", path: "/popular" },
  { icon: Heart, label: "Избранное", color: "soft-pink", path: "/favorites" },
];

export default function HomePage() {
  const navigate = useNavigate();

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
        <ChildProfileCard
          {...mockChild}
          onClick={() => navigate("/profile")}
        />

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
            <Button variant="ghost" size="sm" onClick={() => navigate("/recipes")}>
              Все →
            </Button>
          </div>
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-3"
          >
            {mockRecipes.slice(0, 4).map((recipe) => (
              <motion.div key={recipe.id} variants={item}>
                <RecipeCard
                  {...recipe}
                  onClick={() => navigate(`/recipe/${recipe.id}`)}
                />
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* AI Tip Card */}
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
                  <h3 className="font-bold mb-1">Совет от ИИ</h3>
                  <p className="text-sm text-secondary-foreground/80">
                    В этом возрасте отлично подойдут текстурные блюда. 
                    Попробуйте мягкие кусочки овощей для развития жевательных навыков!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </MobileLayout>
  );
}
