import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChefHat, Clock, Utensils, Coffee, Cookie, Plus, Calendar } from 'lucide-react';
import { useFamily } from '@/contexts/FamilyContext';
import { useMealPlans } from '@/hooks/useMealPlans';
import { useRecipes } from '@/hooks/useRecipes';
import { useChatRecipes } from '@/hooks/useChatRecipes';
import { useToast } from '@/hooks/use-toast';
import { Dialog } from "@/components/ui/dialog";
import { AddMealDialog, MealTypeOption } from "@/components/meal-plan/AddMealDialog";
import { MemberCarousel } from './MemberCarousel';
import type { Tables } from '@/integrations/supabase/types';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const mealTypeConfig: Record<MealType, { icon: typeof Utensils; label: string; color: string; id: string; emoji: string; time: string }> = {
  breakfast: { icon: Coffee, label: 'Завтрак', color: 'bg-peach', id: 'breakfast', emoji: '🌅', time: '08:00' },
  lunch: { icon: Utensils, label: 'Обед', color: 'bg-primary', id: 'lunch', emoji: '☀️', time: '12:00' },
  dinner: { icon: ChefHat, label: 'Ужин', color: 'bg-lavender', id: 'dinner', emoji: '🌙', time: '18:00' },
  snack: { icon: Cookie, label: 'Полдник', color: 'bg-soft-pink', id: 'snack', emoji: '🍎', time: '15:00' },
};

// Конвертируем config в массив options для диалога (хронологический порядок: breakfast → lunch → snack → dinner)
const mealTypesOptions: MealTypeOption[] = Object.values(mealTypeConfig)
  .map((c) => ({ id: c.id, label: c.label, emoji: c.emoji, time: c.time }))
  .sort((a, b) => a.time.localeCompare(b.time));

interface FamilyDashboardProps {
  onAddMember?: () => void;
}

export function FamilyDashboard({ onAddMember }: FamilyDashboardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { members, selectedMember, formatAge } = useFamily();
  const { getMealPlansByDate, createMealPlan, isCreating } = useMealPlans(selectedMember?.id);
  // Для выбора рецепта в план — всегда все рецепты пользователя (любой рецепт можно добавить любому ребёнку)
  const { recipes } = useRecipes();
  const { getTodayChatRecipes } = useChatRecipes();

  const today = new Date();
  const { data: todayMeals = [], isLoading: isLoadingMeals } = getMealPlansByDate(today);

  const mealPlansHook = useMealPlans();
  const { data: allMeals = [] } = mealPlansHook.getMealPlansByDate(today);

  // State for dialog
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState<string | null>(null);

  // Get chat recipes for today
  const todayChatRecipesQuery = getTodayChatRecipes();
  const todayChatRecipes = todayChatRecipesQuery?.data || [];

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

  // Group meals by member for family view
  const mealsByMember = allMeals.reduce((acc, meal) => {
    const memberId = meal.child_id || 'unknown';
    if (!acc[memberId]) acc[memberId] = [];
    acc[memberId].push(meal);
    return acc;
  }, {} as Record<string, typeof allMeals>);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsAddDialogOpen(open);
    if (!open) {
      setSelectedMealType(null);
    }
  };

  const handleAddMeal = async (recipeId: string, mealType: string) => {
    try {
      await createMealPlan({
        child_id: selectedMember?.id || null,
        recipe_id: recipeId,
        planned_date: today.toISOString().split('T')[0],
        meal_type: mealType as any,
        is_completed: false,
      });
      setIsAddDialogOpen(false);
      setSelectedMealType(null);
      toast({
        title: 'Блюдо добавлено',
        description: 'Рецепт успешно добавлен в план питания',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Ошибка',
        description: error.message || 'Не удалось добавить блюдо',
      });
    }
  };

  const handleMealClick = (mealType: MealType, meal: typeof todayMeals[0] | undefined) => {
    if (meal) {
      // Если есть блюдо, переходим к рецепту
      const recipeId = meal.recipe_id || meal.recipe?.id;
      if (recipeId) {
        navigate(`/recipe/${recipeId}`);
      } else {
        // Если рецепт недоступен, показываем сообщение
        toast({
          variant: "destructive",
          title: "Рецепт недоступен",
          description:
            "Не удалось определить рецепт для этого приема пищи. Попробуйте удалить блюдо и добавить его снова.",
        });
      }
    } else {
      // Если блюда нет, открываем диалог добавления
      setSelectedMealType(mealType);
      setIsAddDialogOpen(true);
    }
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-4"
    >
      {/* Member Carousel */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-typo-title font-semibold flex items-center gap-2">
            👨‍👩‍👧‍👦 Семья
            <span className="text-sm font-normal text-muted-foreground">
              ({members.length}/10)
            </span>
          </h2>
        </div>
        <MemberCarousel onAddMember={onAddMember} />
      </motion.div>

      {/* Today's Date */}
      <motion.div variants={item} className="flex items-center gap-2">
        <Calendar className="w-5 h-5 text-primary" />
        <span className="font-medium capitalize">{formatDate(today)}</span>
      </motion.div>

      {/* Selected Member's Menu */}
      {selectedMember && (
        <motion.div variants={item}>
          <Card variant="mint" className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-card/50 flex items-center justify-center text-xl">
                  👤
                </div>
                <div>
                  <h3 className="text-typo-title font-bold">{selectedMember.name}</h3>
                  <p className="text-typo-muted text-muted-foreground">
                    Меню на сегодня
                  </p>
                </div>
              </div>

              <Dialog open={isAddDialogOpen} onOpenChange={handleDialogOpenChange}>
                <AddMealDialog
                  recipes={recipes}
                  chatRecipes={todayChatRecipes}
                  mealTypes={mealTypesOptions}
                  selectedMealType={selectedMealType}
                  onSelectMealType={setSelectedMealType}
                  onAdd={handleAddMeal}
                  isLoading={isCreating}
                />
              </Dialog>

              {isLoadingMeals ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-card/30 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((mealType) => {
                    const meal = todayMeals.find((m) => m.meal_type === mealType);
                    const config = mealTypeConfig[mealType];

                    return (
                      <div
                        key={mealType}
                        onClick={() => handleMealClick(mealType, meal)}
                        className={`flex items-start gap-3 py-2 px-3 rounded-xl bg-card/50 transition-colors cursor-pointer hover:bg-card/80 active:scale-[0.98] ${!meal ? 'opacity-80' : ''}`}
                      >
                        <div className={`w-8 h-8 rounded-lg ${config.color} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <config.icon className="w-4 h-4 text-foreground/80" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-typo-muted text-muted-foreground">{config.label}</p>
                          {meal ? (
                            <p className="text-typo-body font-semibold leading-tight line-clamp-2">
                              {meal.recipe?.title || 'Рецепт'}
                            </p>
                          ) : (
                            <p className="text-typo-body text-muted-foreground italic">Не запланировано</p>
                          )}
                        </div>
                        {meal?.is_completed && (
                          <span className="text-typo-caption px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium flex-shrink-0">
                            ✓
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {todayMeals.length === 0 && (
                    <div className="text-center py-2 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate('/meal-plan')}
                        className="bg-card/50 w-full"
                      >
                        Перейти к плану питания
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Family Overview - All Family Members' Meals - Hidden for cleaner UI */}
      {/* 
      {members.length > 1 && (
        <motion.div variants={item}>
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Обзор семьи на сегодня
          </h3>
          <div className="space-y-2">
            {members.slice(0, 10).map((member) => {
              const memberMeals = mealsByMember[member.id] || [];
              const completedCount = memberMeals.filter(m => m.is_completed).length;

              return (
                <motion.div
                  key={member.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/meal-plan')}
                  className="flex items-center gap-3 p-3 rounded-xl bg-card shadow-soft cursor-pointer hover:shadow-card transition-shadow"
                >
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl">
                    👤
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{member.name}</p>
                    <p className="text-typo-caption text-muted-foreground">
                      {formatAge(member.age_months ?? null)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-typo-muted font-semibold">
                      {memberMeals.length} блюд
                    </p>
                    {memberMeals.length > 0 && (
                      <p className="text-typo-caption text-muted-foreground">
                        {completedCount}/{memberMeals.length} готово
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
      */}
    </motion.div>
  );
}
