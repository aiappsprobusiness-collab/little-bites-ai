import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChefHat, Clock, Utensils, Coffee, Cookie, Plus, Calendar } from 'lucide-react';
import { useSelectedChild } from '@/contexts/SelectedChildContext';
import { useMealPlans } from '@/hooks/useMealPlans';
import { ChildCarousel } from './ChildCarousel';
import type { Tables } from '@/integrations/supabase/types';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const mealTypeConfig: Record<MealType, { icon: typeof Utensils; label: string; color: string }> = {
  breakfast: { icon: Coffee, label: 'Завтрак', color: 'bg-peach' },
  lunch: { icon: Utensils, label: 'Обед', color: 'bg-primary' },
  dinner: { icon: ChefHat, label: 'Ужин', color: 'bg-lavender' },
  snack: { icon: Cookie, label: 'Перекус', color: 'bg-soft-pink' },
};

interface FamilyDashboardProps {
  onAddChild?: () => void;
}

export function FamilyDashboard({ onAddChild }: FamilyDashboardProps) {
  const navigate = useNavigate();
  const { children, selectedChild, formatAge } = useSelectedChild();
  const { getMealPlansByDate } = useMealPlans(selectedChild?.id);
  
  const today = new Date();
  const { data: todayMeals = [], isLoading: isLoadingMeals } = getMealPlansByDate(today);

  // Get all children's meals for today (family overview)
  const allChildrenMealsHook = useMealPlans();
  const { data: allMeals = [] } = allChildrenMealsHook.getMealPlansByDate(today);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  // Group meals by child for family view
  const mealsByChild = allMeals.reduce((acc, meal) => {
    const childId = meal.child_id || 'unknown';
    if (!acc[childId]) acc[childId] = [];
    acc[childId].push(meal);
    return acc;
  }, {} as Record<string, typeof allMeals>);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ru-RU', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-4"
    >
      {/* Child Carousel */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold flex items-center gap-2">
            👨‍👩‍👧‍👦 Семья
            <span className="text-sm font-normal text-muted-foreground">
              ({children.length}/10)
            </span>
          </h2>
        </div>
        <ChildCarousel onAddChild={onAddChild} />
      </motion.div>

      {/* Today's Date */}
      <motion.div variants={item} className="flex items-center gap-2">
        <Calendar className="w-5 h-5 text-primary" />
        <span className="font-medium capitalize">{formatDate(today)}</span>
      </motion.div>

      {/* Selected Child's Menu */}
      {selectedChild && (
        <motion.div variants={item}>
          <Card variant="mint" className="overflow-hidden">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-card/50 flex items-center justify-center text-lg">
                  {selectedChild.avatar_url || "👶"}
                </div>
                <div>
                  <h3 className="font-bold text-sm">{selectedChild.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    Меню на сегодня
                  </p>
                </div>
              </div>

              {isLoadingMeals ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-card/30 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : todayMeals.length > 0 ? (
                <div className="space-y-2">
                  {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((mealType) => {
                    const meal = todayMeals.find((m) => m.meal_type === mealType);
                    const config = mealTypeConfig[mealType];
                    
                    return (
                      <div
                        key={mealType}
                        className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-card/50"
                      >
                        <div className={`w-6 h-6 rounded-md ${config.color} flex items-center justify-center`}>
                          <config.icon className="w-3 h-3 text-foreground/80" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">{config.label}</p>
                          {meal ? (
                            <p className="font-medium text-sm truncate">
                              {meal.recipe?.title || 'Рецепт'}
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">Не запланировано</p>
                          )}
                        </div>
                        {meal?.is_completed && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                            ✓
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-sm text-muted-foreground mb-2">
                    Меню на сегодня не запланировано
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/meal-plan')}
                    className="bg-card/50"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Запланировать
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Family Overview - All Children's Meals */}
      {children.length > 1 && (
        <motion.div variants={item}>
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Обзор семьи на сегодня
          </h3>
          <div className="space-y-2">
            {children.slice(0, 10).map((child) => {
              const childMeals = mealsByChild[child.id] || [];
              const completedCount = childMeals.filter(m => m.is_completed).length;
              
              return (
                <motion.div
                  key={child.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/meal-plan')}
                  className="flex items-center gap-3 p-3 rounded-xl bg-card shadow-soft cursor-pointer hover:shadow-card transition-shadow"
                >
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl">
                    {child.avatar_url || "👶"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{child.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatAge(child.birth_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {childMeals.length} блюд
                    </p>
                    {childMeals.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {completedCount}/{childMeals.length} готово
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Quick Actions */}
      <motion.div variants={item}>
        <Button
          variant="mint"
          className="w-full"
          onClick={() => navigate('/scan')}
        >
          <ChefHat className="w-4 h-4 mr-2" />
          Новый рецепт
        </Button>
      </motion.div>
    </motion.div>
  );
}
