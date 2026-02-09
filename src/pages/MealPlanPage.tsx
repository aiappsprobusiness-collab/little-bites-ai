import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Loader2, Sparkles, Plus, ChevronDown } from "lucide-react";
import { useMealPlans } from "@/hooks/useMealPlans";
import { useFamily } from "@/contexts/FamilyContext";
import { useGenerateWeeklyPlan } from "@/hooks/useGenerateWeeklyPlan";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation } from "react-router-dom";
import { MealCard, MealCardSkeleton } from "@/components/meal-plan/MealCard";
import { ProfileEditSheet } from "@/components/chat/ProfileEditSheet";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppStore } from "@/store/useAppStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const mealTypes = [
  { id: "breakfast", label: "Завтрак", emoji: "🍽", time: "8:30" },
  { id: "lunch", label: "Обед", emoji: "🍽", time: "12:00" },
  { id: "snack", label: "Полдник", emoji: "🍽", time: "15:00" },
  { id: "dinner", label: "Ужин", emoji: "🍽", time: "18:00" },
];

const GENERATION_MESSAGES = [
  "Подбираем меню с учётом возраста",
  "Следим за балансом и разнообразием",
  "Проверяем, чтобы блюда не повторялись",
];

/** Russian date: "Понедельник, 9 февраля" — weekday capitalized, month genitive lowercase */
function formatDayHeader(date: Date): string {
  const weekday = date.toLocaleDateString("ru-RU", { weekday: "long" });
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const day = date.getDate();
  const monthsGenitive = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const month = monthsGenitive[date.getMonth()];
  return `${capitalized}, ${day} ${month}`;
}

export default function MealPlanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { selectedMember, members, selectedMemberId, setSelectedMemberId, isLoading: isMembersLoading } = useFamily();
  const { hasAccess, subscriptionStatus } = useSubscription();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const isFree = !hasAccess;

  // Нет доступа (free/expired): при открытии плана — Paywall
  useEffect(() => {
    if (!hasAccess) {
      setPaywallCustomMessage("Экономьте время с семейным режимом и недельными планами питания.");
      setShowPaywall(true);
    }
    return () => setPaywallCustomMessage(null);
  }, [hasAccess, setShowPaywall, setPaywallCustomMessage]);
  const isFamilyMode = !isFree && selectedMemberId === "family";
  const mealPlanMemberId = isFree && selectedMemberId === "family"
    ? (members[0]?.id ?? undefined)
    : (isFamilyMode ? null : (selectedMemberId || undefined));
  const { getMealPlans, getMealPlansByDate, clearWeekPlan } = useMealPlans(mealPlanMemberId);
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
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [generationMessageIndex, setGenerationMessageIndex] = useState(0);

  const displayName = useMemo(() => {
    if (selectedMemberId === "family" || !selectedMemberId) return "Семья";
    return members.find((c) => c.id === selectedMemberId)?.name ?? "Семья";
  }, [selectedMemberId, members]);
  useEffect(() => {
    if (!isPlanGenerating) return;
    const t = setInterval(() => {
      setGenerationMessageIndex((i) => (i + 1) % GENERATION_MESSAGES.length);
    }, 2800);
    return () => clearInterval(t);
  }, [isPlanGenerating]);

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
  const todayIndex = weekDates.findIndex(
    (date) => date.toDateString() === new Date().toDateString()
  );
  const [selectedDay, setSelectedDay] = useState(todayIndex >= 0 ? todayIndex : 0);
  const prevPathnameRef = useRef(location.pathname);

  // When opening the Plan tab (navigating to it), select today so the week calendar highlights current day
  useEffect(() => {
    const isOnPlan = location.pathname === "/meal-plan";
    const wasOnPlan = prevPathnameRef.current === "/meal-plan";
    prevPathnameRef.current = location.pathname;
    if (isOnPlan && !wasOnPlan && todayIndex >= 0) {
      setSelectedDay(todayIndex);
    }
  }, [location.pathname, todayIndex]);

  const selectedDate = weekDates[selectedDay];
  const { data: dayMealPlans = [], isLoading } = getMealPlansByDate(selectedDate);
  const { data: weekPlans = [] } = getMealPlans(weekStart, weekEnd);
  const hasMealsByDayIndex = weekDates.map(
    (d) => weekPlans.some((p) => p.planned_date === d.toISOString().split("T")[0])
  );
  const weekIsEmpty = weekPlans.length === 0;

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

  const showNoProfile =
    !isFamilyMode && !selectedMember && !isMembersLoading;
  const showEmptyFamily = isFamilyMode && members.length === 0 && !isMembersLoading;

  if (isMembersLoading) {
    return (
      <MobileLayout title="План питания">
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  if (showNoProfile || showEmptyFamily) {
    return (
      <MobileLayout title="План питания">
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <Card variant="default" className="p-8 text-center">
            <CardContent className="p-0">
              <CalendarIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
<h3 className="text-typo-title font-semibold mb-2">Нет профиля ребенка</h3>
            <p className="text-typo-muted text-muted-foreground mb-4">
                {isFree
                  ? "Добавьте профиль ребёнка, чтобы строить план питания."
                  : "Добавьте профиль ребёнка или выберите «Семья» для общего плана"}
              </p>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={() => navigate("/profile")}>
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
        <button
          type="button"
          onClick={() => setShowProfilePicker(true)}
          className="flex items-center gap-1.5 rounded-full min-h-[40px] px-3 py-2 text-typo-muted font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100/90 active:bg-emerald-100 border-0 shadow-none transition-colors whitespace-nowrap"
          aria-label="Выбрать профиль"
        >
          <span className="truncate max-w-[140px]">{displayName}</span>
          <ChevronDown className="w-4 h-4 shrink-0 text-emerald-600/80" aria-hidden />
        </button>
      }
    >
      <div className="flex flex-col min-h-0 pb-safe px-4 pt-4">
        {/* Week calendar — always visible */}
        <div className="mt-2">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none" style={{ scrollbarWidth: "none" }}>
            {weekDays.map((day, index) => {
              const date = weekDates[index];
              const isSelected = selectedDay === index;
              const hasMeals = hasMealsByDayIndex[index];
              return (
                <motion.button
                  key={day}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSelectedDay(index)}
                  className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] py-2.5 px-3 rounded-xl shrink-0 transition-colors ${
                    isSelected
                      ? "bg-emerald-600 text-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                      : "bg-white text-slate-600 border border-slate-200"
                  }`}
                >
                  <span className="text-typo-caption font-medium">{day}</span>
                  <span className="text-typo-body font-semibold leading-tight">{date.getDate()}</span>
                  {hasMeals && (
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? "bg-white/80" : "bg-emerald-500"}`} />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Day content — always show plan structure */}
        <div className="flex-1 mt-5">
          <h2 className="text-typo-title font-semibold text-foreground mb-3">
            {formatDayHeader(selectedDate)}
          </h2>

          {(isLoading || isPlanGenerating) && (
            <p className="text-typo-muted text-muted-foreground mb-3">
              {isPlanGenerating ? GENERATION_MESSAGES[generationMessageIndex] : "Подбираем меню на день…"}
            </p>
          )}
          <div className="space-y-4">
            {mealTypes.map((slot) => {
              const plannedMeal = mealsByType[slot.id];
              const recipe = plannedMeal ? getPlannedMealRecipe(plannedMeal) : null;
              const recipeId = plannedMeal ? getPlannedMealRecipeId(plannedMeal) : null;
              return (
                <div key={slot.id}>
                  <p className="text-typo-caption text-muted-foreground mb-1.5">
                    {slot.emoji} {slot.label} · {slot.time}
                  </p>
                  {isLoading || isPlanGenerating ? (
                    <MealCardSkeleton />
                  ) : plannedMeal && recipeId && recipe?.title ? (
                    <MealCard
                      mealType={plannedMeal.meal_type}
                      recipeTitle={recipe.title}
                      recipeId={recipeId}
                      mealTypeLabel={slot.label}
                      compact
                    />
                  ) : (
                    <p className="text-typo-muted text-muted-foreground/80 py-3">— пока без блюда</p>
                  )}
                </div>
              );
            })}
          </div>
          {weekIsEmpty && !isPlanGenerating && (
            <div className="mt-5">
              <Button
                size="lg"
                className="w-full h-12 rounded-xl font-medium min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                onClick={async () => {
                  if (isFree) {
                    setShowPaywall(true);
                    return;
                  }
                  try {
                    await generateWeeklyPlan();
                    toast({ description: "План на неделю готов" });
                  } catch (e: any) {
                    toast({ variant: "destructive", title: "Ошибка", description: e?.message || "Не удалось создать план" });
                  }
                }}
                disabled={isPlanGenerating}
              >
                <Sparkles className="w-5 h-5 mr-2 shrink-0" />
                Создать план на неделю
              </Button>
              <p className="text-typo-caption text-muted-foreground mt-2 text-center">Меню на семь дней под ваш профиль</p>
            </div>
          )}
        </div>

        {/* Очистить неделю — very low emphasis, below content */}
        {!weekIsEmpty && (
          <div className="mt-6 pb-6">
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("Удалить все блюда на текущую неделю? Это действие нельзя отменить.")) return;
                try {
                  await clearWeekPlan({ startDate: weekStart, endDate: weekEnd });
                  toast({ title: "Неделя очищена", description: "План питания удалён" });
                } catch (e: any) {
                  toast({ variant: "destructive", title: "Ошибка", description: e?.message || "Не удалось очистить" });
                }
              }}
              disabled={isPlanGenerating}
              className="text-typo-caption text-muted-foreground/80 hover:text-muted-foreground transition-colors"
            >
              Очистить неделю
            </button>
          </div>
        )}
      </div>

      {/* Profile picker — opens on tap subtitle (profile name) */}
      <Dialog open={showProfilePicker} onOpenChange={setShowProfilePicker}>
        <DialogContent className="rounded-2xl max-w-[90vw]">
          <DialogHeader>
            <DialogTitle className="text-typo-title font-semibold">Кому готовим?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1 py-2">
            {!isFree && (
              <button
                type="button"
                onClick={() => {
                  setSelectedMemberId("family");
                  setShowProfilePicker(false);
                }}
                className={`text-left py-3 px-4 rounded-xl min-h-[44px] transition-colors ${selectedMemberId === "family" ? "bg-emerald-50 font-medium text-slate-900" : "hover:bg-slate-100 text-slate-700"}`}
              >
                Семья
              </button>
            )}
            {members.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedMemberId(c.id);
                  setShowProfilePicker(false);
                }}
                className={`text-left py-3 px-4 rounded-xl min-h-[44px] transition-colors ${selectedMemberId === c.id ? "bg-emerald-50 font-medium text-slate-900" : "hover:bg-slate-100 text-slate-700"}`}
              >
                {c.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setShowProfilePicker(false);
                setSheetCreateMode(true);
                setShowProfileSheet(true);
              }}
              className="text-left py-3 px-4 rounded-xl min-h-[44px] text-slate-500 hover:bg-slate-100 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Добавить ребёнка
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ProfileEditSheet
        open={showProfileSheet}
        onOpenChange={setShowProfileSheet}
        member={selectedMember}
        createMode={sheetCreateMode}
        onAddNew={() => setSheetCreateMode(true)}
        onCreated={(memberId) => setSelectedMemberId(memberId)}
      />
    </MobileLayout>
  );
}
