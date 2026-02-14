import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Loader2, Sparkles, Plus, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMealPlans } from "@/hooks/useMealPlans";
import { useRecipePreviewsByIds } from "@/hooks/useRecipePreviewsByIds";
import { useRecipes } from "@/hooks/useRecipes";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { useGenerateWeeklyPlan } from "@/hooks/useGenerateWeeklyPlan";
import { useReplaceMealSlot } from "@/hooks/useReplaceMealSlot";
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
import { formatLocalDate } from "@/utils/dateUtils";
import { getRolling7Dates, getRollingStartKey, getRollingEndKey } from "@/utils/dateRange";
import { Check } from "lucide-react";

/** Краткие названия дней: Пн..Вс (индекс 0 = Пн, getDay() 1 = Пн). */
const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
function getDayLabel(date: Date): string {
  return weekDays[(date.getDay() + 6) % 7];
}

type DayTabStatus = "idle" | "loading" | "done";

/** Кнопка дня в календаре недели: active / today / done / loading / idle. */
function DayTabButton({
  dayLabel,
  dateNum,
  isSelected,
  status,
  isToday,
  onClick,
}: {
  dayLabel: string;
  dateNum: number;
  isSelected: boolean;
  status: DayTabStatus;
  isToday: boolean;
  onClick: () => void;
}) {
  const isActive = isSelected;
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-center min-w-[44px] min-h-[44px] py-2.5 px-3 rounded-xl shrink-0 transition-colors border
        ${isActive
          ? "bg-emerald-600 text-white border-emerald-600 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
          : status === "done"
            ? "bg-emerald-50 border-emerald-200 text-slate-700"
            : status === "loading"
              ? "bg-emerald-50 border-emerald-100 text-slate-600 overflow-hidden"
              : "bg-white border-slate-200 text-slate-600"
        }
        ${!isActive && isToday ? "ring-1 ring-emerald-400/60" : ""}
      `}
    >
      {status === "loading" && (
        <span
          className="absolute inset-0 after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-white/40 after:to-transparent after:animate-shimmer pointer-events-none"
          aria-hidden
        />
      )}
      {status === "done" && !isActive && (
        <span className="absolute top-1 right-1.5 text-emerald-600 animate-fade-in" aria-hidden>
          <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
        </span>
      )}
      {status === "done" && isActive && (
        <span className="absolute top-1 right-1.5 text-white/90 animate-fade-in" aria-hidden>
          <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
        </span>
      )}
      <span className="text-typo-caption font-medium relative z-0">{dayLabel}</span>
      <span className="text-typo-body font-semibold leading-tight relative z-0">{dateNum}</span>
      {!isActive && isToday && (
        <span className="relative z-0 text-[10px] font-medium text-emerald-700 bg-emerald-100/60 rounded-full px-2 py-0.5 mt-0.5">
          Сегодня
        </span>
      )}
    </motion.button>
  );
}
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
  const memberDataForPlan = useMemo(() => {
    if (isFamilyMode && members.length > 0) {
      const youngest = [...members].sort((a, b) => (a.age_months ?? 0) - (b.age_months ?? 0))[0];
      const allAllergies = Array.from(new Set(members.flatMap((c) => c.allergies ?? [])));
      const rawPrefs = members.flatMap((c) => (c as { preferences?: string[] }).preferences ?? []);
      const hardBanPattern = /аллерги|нельзя|^без\s+/i;
      const familyPreferences = Array.from(new Set(rawPrefs.filter((p) => hardBanPattern.test(String(p).trim()))));
      return {
        name: "Семья",
        age_months: youngest.age_months ?? 0,
        allergies: allAllergies,
        preferences: familyPreferences,
      };
    }
    const memberForPlan = selectedMember ?? (isFree && selectedMemberId === "family" && members.length > 0 ? members[0] : null);
    if (memberForPlan) {
      const m = memberForPlan as { allergies?: string[]; preferences?: string[] };
      return {
        name: memberForPlan.name,
        age_months: memberForPlan.age_months ?? 0,
        allergies: m.allergies ?? [],
        preferences: m.preferences ?? [],
      };
    }
    return null;
  }, [isFamilyMode, members, selectedMember, isFree, selectedMemberId]);

  const [mutedWeekKey, setMutedWeekKey] = useState<string | null>(null);

  const starterProfile = memberDataForPlan ? { allergies: memberDataForPlan.allergies, preferences: memberDataForPlan.preferences } : null;
  const { getMealPlans, getMealPlansByDate, clearWeekPlan } = useMealPlans(mealPlanMemberId, starterProfile, { mutedWeekKey });

  const memberIdForPlan = mealPlanMemberId ?? null;
  const {
    generateWeeklyPlan,
    regenerateSingleDay,
    generateSingleRollingDay,
    isGenerating: isPlanGenerating,
    completedDays,
    progress,
    generatingDayKeys,
  } = useGenerateWeeklyPlan(memberDataForPlan, memberIdForPlan);

  const isAnyGenerating = isPlanGenerating || generatingDayKeys.size > 0;

  const AUTOFILL_STORAGE_KEY = "mealPlan_autofill_lastRunAt";
  const AUTOFILL_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 часов
  const autogenTriggeredRef = useRef(false);

  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [sheetCreateMode, setSheetCreateMode] = useState(false);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [generationMessageIndex, setGenerationMessageIndex] = useState(0);
  const [replaceSlot, setReplaceSlot] = useState<{ mealType: string; dayKey: string } | null>(null);
  const [replaceLoading, setReplaceLoading] = useState(false);

  const displayName = useMemo(() => {
    if (selectedMemberId === "family" || !selectedMemberId) return "Семья";
    return members.find((c) => c.id === selectedMemberId)?.name ?? "Семья";
  }, [selectedMemberId, members]);
  useEffect(() => {
    if (!isAnyGenerating) return;
    const t = setInterval(() => {
      setGenerationMessageIndex((i) => (i + 1) % GENERATION_MESSAGES.length);
    }, 2800);
    return () => clearInterval(t);
  }, [isAnyGenerating]);

  // Rolling 7 дней: today..today+6 (без прошедших)
  const startKey = getRollingStartKey();
  const endKey = getRollingEndKey();
  const rollingDates = useMemo(() => getRolling7Dates(), [startKey]);
  const todayKey = formatLocalDate(new Date());
  const [selectedDay, setSelectedDay] = useState(0);

  const { replaceWithPool, replaceWithAI, getFreeSwapUsedForDay } = useReplaceMealSlot(
    memberIdForPlan,
    { startKey, endKey, hasAccess }
  );

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[ROLLING range]", {
        startKey,
        endKey,
        keys: rollingDates.map((d) => formatLocalDate(d)),
      });
    }
  }, [startKey, endKey]);

  const prevPathnameRef = useRef(location.pathname);
  useEffect(() => {
    const isOnPlan = location.pathname === "/meal-plan";
    const wasOnPlan = prevPathnameRef.current === "/meal-plan";
    prevPathnameRef.current = location.pathname;
    if (isOnPlan && !wasOnPlan) setSelectedDay(0);
  }, [location.pathname]);

  const selectedDate = rollingDates[selectedDay];
  const selectedDayKey = formatLocalDate(selectedDate);
  const { data: dayMealPlans = [], isLoading } = getMealPlansByDate(selectedDate);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[PLAN render]", { selectedDayKey, found: dayMealPlans.length > 0, mealsCount: dayMealPlans.length });
    }
  }, [selectedDayKey, dayMealPlans.length]);

  const queryClient = useQueryClient();
  const { user } = useAuth();
  const recipeIdsForPreviews = useMemo(
    () => dayMealPlans.map((m) => m.recipe_id).filter((id): id is string => !!id),
    [dayMealPlans]
  );
  const { previews, isLoading: isLoadingPreviews } = useRecipePreviewsByIds(recipeIdsForPreviews);
  const { toggleFavorite } = useRecipes();

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isValidRecipeId = (id: string) => UUID_REGEX.test(id);

  const handleToggleFavorite = useCallback(async (recipeId: string, next: boolean) => {
    const sortedIds = Array.from(new Set(recipeIdsForPreviews)).filter(isValidRecipeId).sort().join(",");
    const queryKey = ["recipe_previews", user?.id, sortedIds] as const;
    const prev = queryClient.getQueryData<Record<string, { isFavorite?: boolean }>>(queryKey);

    queryClient.setQueryData(queryKey, (old: Record<string, { isFavorite?: boolean }> | undefined) => {
      if (!old) return old;
      const nextPreviews = { ...old };
      if (nextPreviews[recipeId]) {
        nextPreviews[recipeId] = { ...nextPreviews[recipeId], isFavorite: next };
      }
      return nextPreviews;
    });

    try {
      await toggleFavorite({ id: recipeId, isFavorite: next, preview: previews[recipeId] });
    } catch (e: unknown) {
      if (prev != null) queryClient.setQueryData(queryKey, prev);
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error)?.message ?? "Не удалось обновить избранное" });
    }
  }, [queryClient, user?.id, recipeIdsForPreviews, toggleFavorite, toast, previews]);

  const handleShare = useCallback(async (recipeId: string, recipeTitle: string) => {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/recipe/${recipeId}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: recipeTitle, url });
        toast({ title: "Рецепт отправлен" });
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast({ title: "Ссылка скопирована" });
      } else {
        toast({ variant: "destructive", title: "Поделиться недоступно", description: "Скопируйте ссылку вручную" });
      }
    } catch (e: unknown) {
      if ((e as Error)?.name !== "AbortError") {
        toast({ variant: "destructive", title: "Ошибка", description: (e as Error)?.message ?? "Не удалось поделиться" });
      }
    }
  }, []);
  const { data: weekPlans = [], isLoading: isWeekPlansLoading } = getMealPlans(rollingDates[0], rollingDates[6]);
  const hasMealsByDayIndex = rollingDates.map(
    (d) => weekPlans.some((p) => p.planned_date === formatLocalDate(d))
  );
  const dayKeys = useMemo(() => rollingDates.map((d) => formatLocalDate(d)), [rollingDates]);
  const missingDayKeys = useMemo(
    () => dayKeys.filter((_, i) => !hasMealsByDayIndex[i]),
    [dayKeys, hasMealsByDayIndex]
  );

  const hasDbWeekPlan = weekPlans.some((p) => !p.isStarter);
  const hasAnyWeekPlan = weekPlans.length > 0;
  /** Диапазон полностью пустой: нет DB и starter скрыт. */
  const isCompletelyEmpty = mutedWeekKey === startKey && !hasAnyWeekPlan;

  /** Индекс дня, который сейчас генерируется (полная неделя). + generatingDayKeys для autofill. */
  const generatingDayIndex = isPlanGenerating && progress ? progress.generatingDayIndex : -1;
  const getDayStatus = (index: number): DayTabStatus => {
    const dayKey = dayKeys[index];
    if (generatingDayIndex === index || (dayKey && generatingDayKeys.has(dayKey))) return "loading";
    if (hasMealsByDayIndex[index] || completedDays[index]) return "done";
    return "idle";
  };

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[ROLLING autofill check]", { startKey, endKey, missing: missingDayKeys });
    }
  }, [startKey, endKey, missingDayKeys]);

  useEffect(() => {
    if (
      isWeekPlansLoading ||
      isAnyGenerating ||
      missingDayKeys.length !== 1 ||
      missingDayKeys[0] !== endKey ||
      !hasAccess ||
      autogenTriggeredRef.current
    )
      return;

    const lastRunAt = typeof localStorage !== "undefined" ? localStorage.getItem(AUTOFILL_STORAGE_KEY) : null;
    const lastRun = lastRunAt ? parseInt(lastRunAt, 10) : 0;
    if (Number.isNaN(lastRun) || Date.now() - lastRun < AUTOFILL_COOLDOWN_MS) return;

    autogenTriggeredRef.current = true;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(AUTOFILL_STORAGE_KEY, String(Date.now()));
    }
    generateSingleRollingDay(rollingDates[6]).catch(() => {
      autogenTriggeredRef.current = false;
    });
  }, [
    isWeekPlansLoading,
    isAnyGenerating,
    missingDayKeys,
    endKey,
    hasAccess,
    rollingDates,
    generateSingleRollingDay,
  ]);

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
            {rollingDates.map((date, index) => {
              const dayKey = formatLocalDate(date);
              return (
                <DayTabButton
                  key={dayKey}
                  dayLabel={getDayLabel(date)}
                  dateNum={date.getDate()}
                  isSelected={selectedDay === index}
                  status={getDayStatus(index)}
                  isToday={dayKey === todayKey}
                  onClick={() => setSelectedDay(index)}
                />
              );
            })}
          </div>
        </div>

        {/* Day content — always show plan structure */}
        <div className="flex-1 mt-5">
          <h2 className="text-typo-title font-semibold text-foreground mb-3">
            {formatDayHeader(selectedDate)}
          </h2>

          {(isLoading || isAnyGenerating) && (
            <div className="mb-3 space-y-1">
              <p className="text-typo-muted text-muted-foreground">
                {isPlanGenerating && progress
                  ? GENERATION_MESSAGES[generationMessageIndex]
                  : generatingDayKeys.size > 0
                    ? "Добавляем следующий день…"
                    : "Подбираем меню на день…"}
              </p>
              {isPlanGenerating && progress && (
                <p className="text-typo-caption text-muted-foreground/90">
                  Генерируем план: {progress.current}/{progress.total} ({progress.currentDayLabel || (progress.generatingDayIndex >= 0 ? getDayLabel(rollingDates[progress.generatingDayIndex] ?? new Date()) : "")})
                </p>
              )}
            </div>
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
                  {isLoading || isAnyGenerating ? (
                    <MealCardSkeleton />
                  ) : plannedMeal && recipeId && recipe?.title ? (
                    <MealCard
                      mealType={plannedMeal.meal_type}
                      recipeTitle={recipe.title}
                      recipeId={recipeId}
                      mealTypeLabel={slot.label}
                      compact
                      isLoadingPreviews={isLoadingPreviews}
                      cookTimeMinutes={previews[recipeId]?.cookTimeMinutes}
                      ingredientNames={previews[recipeId]?.ingredientNames}
                      ingredientTotalCount={previews[recipeId]?.ingredientTotalCount}
                      isFavorite={previews[recipeId]?.isFavorite ?? false}
                      onToggleFavorite={isValidRecipeId(recipeId) ? handleToggleFavorite : undefined}
                      onShare={isValidRecipeId(recipeId) ? handleShare : undefined}
                      onReplace={
                        !isAnyGenerating
                          ? () => setReplaceSlot({ mealType: slot.id, dayKey: selectedDayKey })
                          : undefined
                      }
                    />
                  ) : (
                    <p className="text-typo-muted text-muted-foreground/80 py-3">— пока без блюда</p>
                  )}
                </div>
              );
            })}
          </div>
          {isCompletelyEmpty && !isAnyGenerating && (
            <div className="mt-5 flex flex-col gap-2">
              {isFree ? (
                <Button
                  size="lg"
                  className="w-full h-12 rounded-xl font-medium min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                  onClick={() => setMutedWeekKey(null)}
                  disabled={isAnyGenerating}
                >
                  Заполнить шаблоном
                </Button>
              ) : (
                <>
                  <Button
                    size="lg"
                    className="w-full h-12 rounded-xl font-medium min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                    onClick={async () => {
                      try {
                        await generateWeeklyPlan();
                        setMutedWeekKey(null);
                        toast({ description: "План на 7 дней готов" });
                      } catch (e: any) {
                        toast({ variant: "destructive", title: "Ошибка", description: e?.message || "Не удалось создать план" });
                      }
                    }}
                    disabled={isAnyGenerating}
                  >
                    <Sparkles className="w-5 h-5 mr-2 shrink-0" />
                    Улучшить с AI
                  </Button>
                  <button
                    type="button"
                    onClick={() => setMutedWeekKey(null)}
                    className="text-typo-caption text-emerald-600 hover:text-emerald-700 transition-colors"
                  >
                    Заполнить шаблоном
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Заполнить один день (последний пустой) — когда не сработал autofill или cooldown */}
        {hasAnyWeekPlan &&
          missingDayKeys.length === 1 &&
          missingDayKeys[0] === endKey &&
          !isFree &&
          !isAnyGenerating && (
            <div className="mt-4 flex flex-col gap-1">
              <p className="text-typo-caption text-muted-foreground">Последний день без плана</p>
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                onClick={async () => {
                  if (typeof localStorage !== "undefined") {
                    localStorage.setItem(AUTOFILL_STORAGE_KEY, String(Date.now()));
                  }
                  try {
                    await generateSingleRollingDay(rollingDates[6]);
                    toast({ description: "День добавлен" });
                  } catch (e: any) {
                    toast({ variant: "destructive", title: "Ошибка", description: e?.message || "Не удалось сгенерировать день" });
                  }
                }}
              >
                Заполнить день
              </Button>
            </div>
          )}

        {/* Очистить 7 дней / Улучшить с AI — below content, когда есть план */}
        {hasAnyWeekPlan && (
          <div className="mt-6 pb-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={async () => {
                const msg = hasDbWeekPlan
                  ? "Удалить все блюда на ближайшие 7 дней? Это действие нельзя отменить."
                  : "Скрыть шаблонное меню на эти 7 дней?";
                if (!window.confirm(msg)) return;
                setMutedWeekKey(startKey);
                if (hasDbWeekPlan) {
                  try {
                    await clearWeekPlan({ startDate: rollingDates[0], endDate: rollingDates[6] });
                    toast({ title: "План на 7 дней очищен", description: "План питания удалён" });
                  } catch (e: any) {
                    toast({ variant: "destructive", title: "Ошибка", description: e?.message || "Не удалось очистить" });
                  }
                }
              }}
              disabled={isAnyGenerating}
              className="text-typo-caption text-muted-foreground/80 hover:text-muted-foreground transition-colors text-left"
            >
              Очистить 7 дней
            </button>
            {!isFree && (
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                disabled={isAnyGenerating}
                onClick={async () => {
                  try {
                    await generateWeeklyPlan();
                    setMutedWeekKey(null);
                    toast({ description: "План на 7 дней готов" });
                  } catch (e: any) {
                    toast({ variant: "destructive", title: "Ошибка", description: e?.message || "Не удалось создать план" });
                  }
                }}
              >
                <Sparkles className="w-4 h-4 mr-1.5 shrink-0" />
                Улучшить с AI
              </Button>
            )}
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

      {/* Заменить приём пищи */}
      <Dialog open={!!replaceSlot} onOpenChange={(open) => !open && setReplaceSlot(null)}>
        <DialogContent className="rounded-2xl max-w-[90vw]">
          <DialogHeader>
            <DialogTitle className="text-typo-title font-semibold">
              Заменить {replaceSlot ? mealTypes.find((s) => s.id === replaceSlot.mealType)?.label ?? replaceSlot.mealType : ""}
            </DialogTitle>
            <p className="text-typo-caption text-muted-foreground">
              Заменится только этот приём пищи.
            </p>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={replaceLoading || (isFree && getFreeSwapUsedForDay(replaceSlot?.dayKey ?? ""))}
              onClick={async () => {
                if (!replaceSlot) return;
                setReplaceLoading(true);
                try {
                  const excludeTitles = [...new Set(weekPlans.map((p) => p.recipe?.title).filter(Boolean))] as string[];
                  const excludeRecipeIds = [...new Set(weekPlans.map((p) => p.recipe_id).filter(Boolean))] as string[];
                  const result = await replaceWithPool({
                    dayKey: replaceSlot.dayKey,
                    mealType: replaceSlot.mealType,
                    excludeTitles,
                    excludeRecipeIds,
                    isFree,
                  });
                  if (result === "ok") {
                    toast({ description: "Блюдо заменено" });
                    setReplaceSlot(null);
                  } else if (result === "ok_legacy") {
                    toast({ description: "Блюдо заменено (из старых рецептов)" });
                    setReplaceSlot(null);
                  } else if (result === "limit") {
                    toast({
                      variant: "destructive",
                      title: "Лимит",
                      description: "1 замена в день (Free). Доступна замена с AI в Premium.",
                    });
                  } else {
                    toast({
                      variant: "destructive",
                      title: "Не нашли",
                      description: "Не нашли в ваших рецептах. Доступна замена с AI (Premium).",
                    });
                  }
                } catch (e: any) {
                  toast({ variant: "destructive", title: "Ошибка", description: e?.message ?? "Не удалось заменить" });
                } finally {
                  setReplaceLoading(false);
                }
              }}
            >
              Быстрая замена (из ваших рецептов)
            </Button>
            {!isFree && (
              <Button
                variant="outline"
                className="w-full justify-start"
                disabled={replaceLoading}
                onClick={async () => {
                  if (!replaceSlot) return;
                  setReplaceLoading(true);
                  try {
                    const excludeTitles = [...new Set(weekPlans.map((p) => p.recipe?.title).filter(Boolean))] as string[];
                    await replaceWithAI({
                      dayKey: replaceSlot.dayKey,
                      mealType: replaceSlot.mealType,
                      memberData: memberDataForPlan
                        ? {
                            allergies: memberDataForPlan.allergies,
                            preferences: memberDataForPlan.preferences,
                            age_months: memberDataForPlan.age_months,
                          }
                        : null,
                      excludeTitles,
                    });
                    toast({ description: "Блюдо заменено" });
                    setReplaceSlot(null);
                  } catch (e: any) {
                    toast({ variant: "destructive", title: "Ошибка", description: e?.message ?? "Не удалось сгенерировать" });
                  } finally {
                    setReplaceLoading(false);
                  }
                }}
              >
                <Sparkles className="w-4 h-4 mr-2 shrink-0" />
                С AI
              </Button>
            )}
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
