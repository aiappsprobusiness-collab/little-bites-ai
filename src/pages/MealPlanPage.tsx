import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Calendar as CalendarIcon, Loader2, X, Pencil } from "lucide-react";
import { useMealPlans } from "@/hooks/useMealPlans";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { useRecipes } from "@/hooks/useRecipes";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useChatRecipes } from "@/hooks/useChatRecipes";
import { AddMealDialog } from "@/components/meal-plan/AddMealDialog";
import { ProfileEditSheet } from "@/components/chat/ProfileEditSheet";
import { useAppStore } from "@/store/useAppStore";
import { resolveUnit } from "@/utils/productUtils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
} from "@/components/ui/dialog";

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const mealTypes = [
  { id: "breakfast", label: "Завтрак", emoji: "🌅", time: "08:00" },
  { id: "lunch", label: "Обед", emoji: "☀️", time: "12:00" },
  { id: "snack", label: "Полдник", emoji: "🍎", time: "15:00" },
  { id: "dinner", label: "Ужин", emoji: "🌙", time: "18:00" },
];

export default function MealPlanPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedChild, children, selectedChildId, setSelectedChildId } = useSelectedChild();
  // Для выбора рецепта в план — всегда все рецепты пользователя (любой рецепт можно добавить любому ребёнку)
  const { recipes, createRecipe } = useRecipes();
  const { getMealPlansByDate, createMealPlan, deleteMealPlan, isCreating } = useMealPlans(selectedChild?.id);
  const { getTodayChatRecipes } = useChatRecipes();
  const favorites = useAppStore((s) => s.favorites);

  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [sheetCreateMode, setSheetCreateMode] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState<string | null>(null);

  // Вычисляем текущую неделю и находим индекс текущего дня
  const getCurrentWeekDates = () => {
    const dates = [];
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Понедельник

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const weekDates = getCurrentWeekDates();
  // Находим индекс текущего дня в неделе
  const todayIndex = weekDates.findIndex(
    (date) => date.toDateString() === new Date().toDateString()
  );
  const [selectedDay, setSelectedDay] = useState(todayIndex >= 0 ? todayIndex : 0);

  const selectedDate = weekDates[selectedDay];
  const { data: dayMealPlans = [], isLoading } = getMealPlansByDate(selectedDate);

  const isToday = selectedDate.toDateString() === new Date().toDateString();
  const todayChatRecipesQuery = getTodayChatRecipes();
  const todayChatRecipes = todayChatRecipesQuery?.data || [];

  const getPlannedMealRecipe = (plannedMeal: any) => {
    // В зависимости от select в Supabase джойн может прийти как `recipe` или `recipes`
    return plannedMeal?.recipe ?? plannedMeal?.recipes ?? null;
  };

  const getPlannedMealRecipeId = (plannedMeal: any) => {
    return plannedMeal?.recipe_id ?? getPlannedMealRecipe(plannedMeal)?.id ?? null;
  };

  // Группируем планы по типу приема пищи
  const mealsByType = mealTypes.reduce((acc, mealType) => {
    const plan = dayMealPlans.find((mp) => mp.meal_type === mealType.id);
    acc[mealType.id] = plan || null;
    return acc;
  }, {} as Record<string, typeof dayMealPlans[0] | null>);

  const handleAddMeal = async (recipeId: string, mealType: string) => {
    try {
      await createMealPlan({
        child_id: selectedChild?.id || null,
        recipe_id: recipeId,
        planned_date: selectedDate.toISOString().split("T")[0],
        meal_type: mealType as any,
        is_completed: false,
      });
      setIsAddDialogOpen(false);
      setSelectedMealType(null);
      toast({
        title: "Блюдо добавлено",
        description: "Рецепт успешно добавлен в план питания",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось добавить блюдо",
      });
    }
  };

  const handleAddFromFavorite = async (favoriteId: string, mealType: string) => {
    try {
      const favorite = favorites.find((f) => f.id === favoriteId);
      if (!favorite) {
        toast({
          variant: "destructive",
          title: "Ошибка",
          description: "Избранный рецепт не найден",
        });
        return;
      }

      // Создаем рецепт из избранного
      const newRecipe = await createRecipe({
        recipe: {
          title: favorite.recipe.title,
          description: favorite.recipe.description || "",
          cooking_time_minutes: favorite.recipe.cookingTime || null,
          child_id: selectedChild?.id || null,
        },
        ingredients: (favorite.recipe.ingredients || []).map((ing, index) => ({
          name: ing,
          amount: null,
          unit: resolveUnit(null, ing),
          category: "other" as const,
          order_index: index,
        })),
        steps: (favorite.recipe.steps || []).map((step, index) => ({
          instruction: step,
          step_number: index + 1,
          duration_minutes: null,
          image_url: null,
        })),
      });

      // Добавляем созданный рецепт в план
      await createMealPlan({
        child_id: selectedChild?.id || null,
        recipe_id: newRecipe.id,
        planned_date: selectedDate.toISOString().split("T")[0],
        meal_type: mealType as any,
        is_completed: false,
      });

      setIsAddDialogOpen(false);
      setSelectedMealType(null);
      toast({
        title: "Блюдо добавлено",
        description: "Рецепт из избранного успешно добавлен в план питания",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось добавить блюдо из избранного",
      });
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsAddDialogOpen(open);
    if (!open) {
      // Сбрасываем выбранный тип при закрытии диалога
      setSelectedMealType(null);
    }
  };

  const handleDeleteMeal = async (mealPlanId: string) => {
    try {
      await deleteMealPlan(mealPlanId);
      toast({
        title: "Блюдо удалено",
        description: "Рецепт удален из плана питания",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось удалить блюдо",
      });
    }
  };

  if (!selectedChild) {
    return (
      <MobileLayout title="План питания">
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <Card variant="default" className="p-8 text-center">
            <CardContent className="p-0">
              <CalendarIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-bold mb-2">Нет профиля ребенка</h3>
              <p className="text-muted-foreground mb-4">
                Добавьте профиль ребенка, чтобы планировать питание
              </p>
              <Button variant="mint" onClick={() => navigate("/profile")}>
                Добавить ребенка
              </Button>
            </CardContent>
          </Card>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="План питания">
      <div className="space-y-6">
        {/* Готовим для */}
        <div className="px-4 pt-4 pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Готовим для:</span>
            <Select
              value={selectedChildId ?? "family"}
              onValueChange={(v) => setSelectedChildId(v)}
            >
              <SelectTrigger className="w-[180px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="family">Семья</SelectItem>
                {children.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => {
                setSheetCreateMode(true);
                setShowProfileSheet(true);
              }}
              title="Добавить профиль"
            >
              <Plus className="w-4 h-4" />
            </Button>
            {selectedChild && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setSheetCreateMode(false);
                  setShowProfileSheet(true);
                }}
                title="Редактировать профиль"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Week Strip */}
        <div className="px-4">
          {/* Day Selector */}
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day, index) => {
              const date = weekDates[index];
              const isSelected = selectedDay === index;
              const isToday =
                date.toDateString() === new Date().toDateString();
              const hasMeals = dayMealPlans.length > 0;

              return (
                <motion.button
                  key={day}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedDay(index)}
                  className={`flex flex-col items-center py-3 rounded-2xl transition-all ${isSelected
                      ? "gradient-primary text-primary-foreground shadow-button"
                      : isToday
                        ? "bg-primary/10 border-2 border-primary"
                        : "bg-card shadow-soft"
                    }`}
                >
                  <span className="text-xs font-medium opacity-80">{day}</span>
                  <span className="text-lg font-bold">{date.getDate()}</span>
                  {hasMeals && !isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1" />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Profile Edit Sheet */}
        <ProfileEditSheet
          open={showProfileSheet}
          onOpenChange={setShowProfileSheet}
          child={selectedChild}
          createMode={sheetCreateMode}
          onAddNew={() => {
            setSheetCreateMode(true);
          }}
          onCreated={(childId) => {
            setSelectedChildId(childId);
          }}
        />

        {/* Meals for Selected Day */}
        <div className="px-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">
              {selectedDate.toLocaleDateString("ru-RU", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </h2>
            <Dialog open={isAddDialogOpen} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // При открытии из общей кнопки сбрасываем тип (будет использован первый по умолчанию)
                    setSelectedMealType(null);
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Добавить
                </Button>
              </DialogTrigger>
              <AddMealDialog
                recipes={recipes}
                chatRecipes={todayChatRecipes}
                favorites={favorites}
                mealTypes={mealTypes}
                selectedMealType={selectedMealType}
                onSelectMealType={setSelectedMealType}
                onAdd={handleAddMeal}
                onAddFromFavorite={handleAddFromFavorite}
                isLoading={isCreating}
              />
            </Dialog>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            mealTypes.map((meal, index) => {
              const plannedMeal = mealsByType[meal.id];
              const openAddForMeal = () => {
                setSelectedMealType(meal.id);
                setIsAddDialogOpen(true);
              };

              return (
                <motion.div
                  key={meal.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card
                    variant={plannedMeal ? "mint" : "default"}
                    className={`${!plannedMeal ? "border-dashed border-2 cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
                    onClick={!plannedMeal ? openAddForMeal : undefined}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="text-3xl">{meal.emoji}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-semibold">{meal.label}</span>
                            <span className="text-xs text-muted-foreground">{meal.time}</span>
                          </div>
                          {plannedMeal ? (
                            <div className="mt-1">
                              <p className="text-sm font-medium">
                                {getPlannedMealRecipe(plannedMeal)?.title || "Рецепт"}
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-2 h-6 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const recipeId = getPlannedMealRecipeId(plannedMeal);
                                  if (!recipeId) {
                                    toast({
                                      variant: "destructive",
                                      title: "Рецепт недоступен",
                                      description:
                                        "Не удалось определить рецепт для этого приема пищи. Попробуйте удалить блюдо и добавить его снова.",
                                    });
                                    return;
                                  }
                                  navigate(`/recipe/${recipeId}`);
                                }}
                              >
                                Открыть рецепт →
                              </Button>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground mt-1">
                              Добавить рецепт
                            </p>
                          )}
                        </div>
                        {plannedMeal ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMeal(plannedMeal.id);
                            }}
                          >
                            <X className="w-5 h-5" />
                          </Button>
                        ) : (
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground border-2 border-dashed border-muted-foreground/30 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAddForMeal();
                            }}
                          >
                            <Plus className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Actions */}
        <div className="px-4 pb-6 space-y-3">
          <Button
            variant="peach"
            size="lg"
            className="w-full"
            onClick={() => navigate("/shopping")}
          >
            🛒 Список покупок
          </Button>
        </div>
      </div>
    </MobileLayout>
  );
}

// Тип приема пищи для диалога удален, так как он теперь импортируется из AddMealDialog
// Диалог для добавления блюда удален, так как он теперь импортируется из AddMealDialog
