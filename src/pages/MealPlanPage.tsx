import { useState } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Loader2, X } from "lucide-react";
import { useMealPlans } from "@/hooks/useMealPlans";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { useRecipes } from "@/hooks/useRecipes";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { ChildCarousel } from "@/components/family/ChildCarousel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const { selectedChild } = useSelectedChild();
  const { recipes } = useRecipes(selectedChild?.id);
  const { getMealPlansByDate, createMealPlan, deleteMealPlan, isCreating } = useMealPlans(selectedChild?.id);

  const [selectedDay, setSelectedDay] = useState(0);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState<string | null>(null);

  const getWeekDates = () => {
    const dates = [];
    const startOfWeek = new Date(currentWeek);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(date.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const weekDates = getWeekDates();
  const selectedDate = weekDates[selectedDay];
  const { data: dayMealPlans = [], isLoading } = getMealPlansByDate(selectedDate);

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
        {/* Child Carousel */}
        <div className="px-4 pt-4">
          <ChildCarousel compact />
        </div>

        {/* Week Navigation */}
        <div className="px-4">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const prev = new Date(currentWeek);
                prev.setDate(prev.getDate() - 7);
                setCurrentWeek(prev);
              }}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-center">
              <p className="text-base font-bold">
                {weekDates[0].toLocaleDateString("ru-RU", { month: "long" })}
              </p>
              <p className="text-sm text-muted-foreground">
                {weekDates[0].getDate()} - {weekDates[6].getDate()}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const next = new Date(currentWeek);
                next.setDate(next.getDate() + 7);
                setCurrentWeek(next);
              }}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

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
                  className={`flex flex-col items-center py-3 rounded-2xl transition-all ${
                    isSelected
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
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Добавить
                </Button>
              </DialogTrigger>
              <AddMealDialog
                recipes={recipes}
                mealTypes={mealTypes}
                selectedMealType={selectedMealType}
                onSelectMealType={setSelectedMealType}
                onAdd={handleAddMeal}
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

              return (
                <motion.div
                  key={meal.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card
                    variant={plannedMeal ? "mint" : "default"}
                    className={`${!plannedMeal ? "border-dashed border-2" : ""}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="text-3xl">{meal.emoji}</div>
                        <div className="flex-1">
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
                                onClick={() => {
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
                            onClick={() => handleDeleteMeal(plannedMeal.id)}
                          >
                            <X className="w-5 h-5" />
                          </Button>
                        ) : (
                          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setSelectedMealType(meal.id)}
                              >
                                <Plus className="w-5 h-5" />
                              </Button>
                            </DialogTrigger>
                            <AddMealDialog
                              recipes={recipes}
                              mealTypes={mealTypes}
                              selectedMealType={meal.id}
                              onSelectMealType={setSelectedMealType}
                              onAdd={handleAddMeal}
                              isLoading={isCreating}
                            />
                          </Dialog>
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
            variant="mint"
            size="lg"
            className="w-full"
            onClick={() => navigate("/generate-plan")}
          >
            ✨ Сгенерировать план на неделю
          </Button>
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

// Тип приема пищи для диалога
interface MealTypeOption {
  id: string;
  label: string;
  emoji: string;
  time: string;
}

// Диалог для добавления блюда
function AddMealDialog({
  recipes,
  mealTypes: mealTypesOptions,
  selectedMealType,
  onSelectMealType,
  onAdd,
  isLoading,
}: {
  recipes: any[];
  mealTypes: MealTypeOption[];
  selectedMealType: string | null;
  onSelectMealType: (type: string) => void;
  onAdd: (recipeId: string, mealType: string) => void;
  isLoading: boolean;
}) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("");
  const mealType = selectedMealType || mealTypesOptions[0].id;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRecipeId) {
      onAdd(selectedRecipeId, mealType);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Добавить блюдо</DialogTitle>
        <DialogDescription>
          Выберите рецепт для добавления в план питания
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Тип приема пищи</label>
          <Select value={mealType} onValueChange={onSelectMealType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {mealTypesOptions.map((mt) => (
                <SelectItem key={mt.id} value={mt.id}>
                  {mt.emoji} {mt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Рецепт</label>
          <Select value={selectedRecipeId} onValueChange={setSelectedRecipeId}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите рецепт" />
            </SelectTrigger>
            <SelectContent>
              {recipes.length > 0 ? (
                recipes.map((recipe) => (
                  <SelectItem key={recipe.id} value={recipe.id}>
                    {recipe.title}
                  </SelectItem>
                ))
              ) : (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Нет доступных рецептов
                </div>
              )}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          variant="mint"
          className="w-full"
          disabled={isLoading || !selectedRecipeId}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Добавление...
            </>
          ) : (
            "Добавить"
          )}
        </Button>
      </form>
    </DialogContent>
  );
}
