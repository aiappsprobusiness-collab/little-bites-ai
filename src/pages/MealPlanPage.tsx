import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Calendar as CalendarIcon, Loader2, X, Pencil, Sparkles, Check, ArrowLeft } from "lucide-react";
import { useMealPlans } from "@/hooks/useMealPlans";
import { useFamily } from "@/contexts/FamilyContext";
import { useRecipes } from "@/hooks/useRecipes";
import { useGenerateWeeklyPlan } from "@/hooks/useGenerateWeeklyPlan";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useChatRecipes } from "@/hooks/useChatRecipes";
import { AddMealDialog } from "@/components/meal-plan/AddMealDialog";
import { ProfileEditSheet } from "@/components/chat/ProfileEditSheet";
import { useFavorites } from "@/hooks/useFavorites";
import { useSubscription } from "@/hooks/useSubscription";
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
  const { selectedMember, members, selectedMemberId, setSelectedMemberId, isLoading: isMembersLoading } = useFamily();
  const { hasPremiumAccess, subscriptionStatus } = useSubscription();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const isFree = !hasPremiumAccess;

  // Нет доступа (free/expired): при открытии плана — Paywall
  useEffect(() => {
    if (!hasPremiumAccess) {
      setPaywallCustomMessage("Экономьте время с семейным режимом и недельными планами питания.");
      setShowPaywall(true);
    }
    return () => setPaywallCustomMessage(null);
  }, [hasPremiumAccess, setShowPaywall, setPaywallCustomMessage]);
  const isFamilyMode = !isFree && selectedMemberId === "family";
  const mealPlanMemberId = isFree && selectedMemberId === "family"
    ? (members[0]?.id ?? undefined)
    : (isFamilyMode ? null : (selectedMemberId || undefined));
  const { recipes, createRecipe } = useRecipes();
  const { getMealPlansByDate, createMealPlan, deleteMealPlan, clearWeekPlan, isCreating } = useMealPlans(mealPlanMemberId);
  const { getTodayChatRecipes } = useChatRecipes();
  const { favorites } = useFavorites();
  const memberDataForPlan = useMemo(() => {
    if (isFamilyMode && members.length > 0) {
      const youngest = [...members].sort((a, b) => (a.age_months ?? 0) - (b.age_months ?? 0))[0];
      const allAllergies = Array.from(new Set(members.flatMap((c) => c.allergies ?? [])));
      return {
        name: "Семья",
        age_months: youngest.age_months ?? 0,
        allergies: allAllergies,
      };
    }
    const memberForPlan = selectedMember ?? (isFree && selectedMemberId === "family" && members.length > 0 ? members[0] : null);
    if (memberForPlan) {
      return {
        name: memberForPlan.name,
        age_months: memberForPlan.age_months ?? 0,
        allergies: memberForPlan.allergies ?? [],
      };
    }
    return null;
  }, [isFamilyMode, members, selectedMember, isFree, selectedMemberId]);

  const memberIdForPlan = mealPlanMemberId ?? null;
  const { generateWeeklyPlan, regenerateSingleDay, isGenerating: isPlanGenerating, completedDays } = useGenerateWeeklyPlan(
    memberDataForPlan,
    memberIdForPlan
  );

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
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];
  // Находим индекс текущего дня в неделе
  const todayIndex = weekDates.findIndex(
    (date) => date.toDateString() === new Date().toDateString()
  );
  const [selectedDay, setSelectedDay] = useState(todayIndex >= 0 ? todayIndex : 0);

  const selectedDate = weekDates[selectedDay];
  const { data: dayMealPlans = [], isLoading } = getMealPlansByDate(selectedDate);

  const isToday = selectedDate.toDateString() === new Date().toDateString();
  const todayChatRecipesQuery = getTodayChatRecipes();
  const todayChatRecipes: any[] = Array.isArray(todayChatRecipesQuery?.data)
    ? todayChatRecipesQuery.data
    : [];

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
        child_id: memberIdForPlan ?? null,
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
          child_id: memberIdForPlan ?? null,
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
        child_id: memberIdForPlan ?? null,
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

  const showNoProfile =
    !isFamilyMode && !selectedMember && !isMembersLoading;
  const showEmptyFamily = isFamilyMode && members.length === 0 && !isMembersLoading;

  if (isMembersLoading) {
    return (
      <MobileLayout
        title="План питания"
        headerLeft={
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Назад">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        }
      >
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  if (showNoProfile || showEmptyFamily) {
    return (
      <MobileLayout
        title="План питания"
        headerLeft={
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Назад">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        }
      >
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <Card variant="default" className="p-8 text-center">
            <CardContent className="p-0">
              <CalendarIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-bold mb-2">Нет профиля ребенка</h3>
              <p className="text-muted-foreground mb-4">
                {isFree
                  ? "Добавьте профиль ребёнка, чтобы строить план питания."
                  : "Добавьте профиль ребёнка или выберите «Семья» для общего плана"}
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
    <MobileLayout
      title="План питания"
      headerRight={
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Назад">
          <ArrowLeft className="w-5 h-5" />
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Готовим для */}
        <div className="px-4 pt-4 pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Готовим для:</span>
            <Select
              value={
                isFree
                  ? (selectedMemberId === "family" ? members[0]?.id ?? "" : selectedMemberId ?? members[0]?.id ?? "")
                  : (selectedMemberId ?? "family")
              }
              onValueChange={(v) => setSelectedMemberId(v)}
            >
              <SelectTrigger className="w-[180px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!isFree && <SelectItem value="family">Семья</SelectItem>}
                {members.map((c, idx) => (
                  <SelectItem key={`${c.id}-${idx}`} value={c.id}>
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
            {selectedMember && (
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

        {/* Кнопка генерации плана на неделю */}
        <div className="px-4">
          <Button
            variant="mint"
            size="lg"
            className="w-full h-14 rounded-2xl shadow-soft font-semibold text-base gradient-primary text-primary-foreground border-0"
            onClick={async () => {
              if (isFree) {
                setShowPaywall(true);
                return;
              }
              try {
                await generateWeeklyPlan();
                toast({
                  title: "План создан",
                  description: "План питания на неделю успешно сгенерирован",
                });
              } catch (e: any) {
                toast({
                  variant: "destructive",
                  title: "Ошибка",
                  description: e?.message || "Не удалось создать план",
                });
              }
            }}
            disabled={isPlanGenerating}
          >
            {isPlanGenerating ? (
              <div className="flex items-center gap-3 w-full justify-center">
                <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                <div className="flex gap-1.5">
                  {weekDays.map((d, i) => (
                    <span
                      key={d}
                      className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-medium transition-all ${completedDays[i]
                        ? "bg-primary/20 text-primary"
                        : "bg-muted/50 text-muted-foreground"
                        }`}
                    >
                      {completedDays[i] ? <Check className="w-3.5 h-3.5" /> : d}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2 shrink-0" />
                Создать план питания на неделю
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 text-muted-foreground"
            onClick={async () => {
              if (!window.confirm("Удалить все блюда на текущую неделю? Это действие нельзя отменить.")) return;
              try {
                await clearWeekPlan({ startDate: weekStart, endDate: weekEnd });
                toast({ title: "Неделя очищена", description: "План питания удалён" });
              } catch (e: any) {
                toast({
                  variant: "destructive",
                  title: "Ошибка",
                  description: e?.message || "Не удалось очистить",
                });
              }
            }}
            disabled={isPlanGenerating}
          >
            Очистить неделю
          </Button>
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
          member={selectedMember}
          createMode={sheetCreateMode}
          onAddNew={() => {
            setSheetCreateMode(true);
          }}
          onCreated={(memberId) => {
            setSelectedMemberId(memberId);
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
                recipes={Array.isArray(recipes) ? recipes : []}
                chatRecipes={[...(Array.isArray(todayChatRecipes) ? todayChatRecipes : [])]}
                favorites={Array.isArray(favorites) ? favorites : []}
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
          ) : dayMealPlans.length === 0 ? (
            <div className="space-y-3">
              <Card variant="default" className="p-6 text-center border-dashed">
                <CardContent className="p-0">
                  <p className="text-muted-foreground mb-4">
                    Нет блюд на этот день
                  </p>
                  <Button
                    variant="mint"
                    size="lg"
                    className="rounded-xl shadow-soft font-medium"
                    onClick={async () => {
                      try {
                        await regenerateSingleDay(selectedDay);
                        toast({
                          title: "День перегенерирован",
                          description: "План питания на выбранный день обновлён",
                        });
                      } catch (e: any) {
                        toast({
                          variant: "destructive",
                          title: "Ошибка",
                          description: e?.message || "Не удалось перегенерировать",
                        });
                      }
                    }}
                    disabled={isPlanGenerating}
                  >
                    {isPlanGenerating ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="w-5 h-5 mr-2" />
                    )}
                    Попробовать еще раз
                  </Button>
                </CardContent>
              </Card>
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

      </div>
    </MobileLayout>
  );
}

// Тип приема пищи для диалога удален, так как он теперь импортируется из AddMealDialog
// Диалог для добавления блюда удален, так как он теперь импортируется из AddMealDialog
