import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Loader2, Sparkles, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMealPlans, mealPlansKey } from "@/hooks/useMealPlans";
import { useRecipePreviewsByIds } from "@/hooks/useRecipePreviewsByIds";
import { useRecipes } from "@/hooks/useRecipes";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { usePlanGenerationJob, getStoredJobId, setStoredJobId } from "@/hooks/usePlanGenerationJob";
import { useReplaceMealSlot } from "@/hooks/useReplaceMealSlot";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation } from "react-router-dom";
import { MealCard, MealCardSkeleton } from "@/components/meal-plan/MealCard";
import { MemberSelectorButton } from "@/components/family/MemberSelectorButton";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppStore } from "@/store/useAppStore";
import { formatLocalDate } from "@/utils/dateUtils";
import { getRolling7Dates, getRollingStartKey, getRollingEndKey, getRollingDayKeys } from "@/utils/dateRange";
import { Check, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Включить визуальный debug пула: window.__PLAN_DEBUG = true или ?debugPool=1 */
function isPlanDebug(): boolean {
  if (typeof window === "undefined") return false;
  return (window as Window & { __PLAN_DEBUG?: boolean }).__PLAN_DEBUG === true || new URLSearchParams(window.location.search).get("debugPool") === "1";
}

/** Включить perf-логи: ?perf=1 */
function isPerf(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("perf") === "1";
}

/** Обновить кэш планов после replace_slot (optimistic update). Поддерживает замену существующего слота и добавление в пустой. */
function applyReplaceSlotToPlanCache(
  queryClient: ReturnType<typeof useQueryClient>,
  keys: { mealPlansKeyWeek: unknown[]; mealPlansKeyDay: unknown[] },
  payload: { dayKey: string; mealType: string; newRecipeId: string; title: string; plan_source: "pool" | "ai" },
  memberId?: string | null
) {
  const newItem = {
    id: `filled_${payload.dayKey}_${payload.mealType}`,
    planned_date: payload.dayKey,
    meal_type: payload.mealType,
    recipe_id: payload.newRecipeId,
    recipe: { id: payload.newRecipeId, title: payload.title },
    child_id: memberId ?? null,
    member_id: memberId ?? null,
    plan_source: payload.plan_source,
  };
  const updater = (old: Array<{ planned_date: string; meal_type: string; recipe_id: string | null; recipe: { id: string; title: string } | null; plan_source?: string }> | undefined) => {
    if (!old) return old;
    const idx = old.findIndex((item) => item.planned_date === payload.dayKey && item.meal_type === payload.mealType);
    if (idx >= 0) {
      return old.map((item, i) =>
        i === idx ? { ...item, recipe_id: payload.newRecipeId, recipe: { id: payload.newRecipeId, title: payload.title }, plan_source: payload.plan_source } : item
      );
    }
    return [...old, newItem];
  };
  queryClient.setQueryData(keys.mealPlansKeyWeek, updater);
  queryClient.setQueryData(keys.mealPlansKeyDay, updater);
}

/** Краткие названия дней: Пн..Вс (индекс 0 = Пн, getDay() 1 = Пн). */
const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
function getDayLabel(date: Date): string {
  return weekDays[(date.getDay() + 6) % 7];
}

type DayTabStatus = "idle" | "loading" | "done";

/** Компактная кнопка дня: активный = заливка, остальные = тонкая рамка; индикатор «день заполнен». */
function DayTabButton({
  dayLabel,
  dateNum,
  isSelected,
  status,
  isToday,
  disabled,
  isLocked,
  onClick,
}: {
  dayLabel: string;
  dateNum: number;
  isSelected: boolean;
  status: DayTabStatus;
  isToday: boolean;
  disabled?: boolean;
  isLocked?: boolean;
  onClick: () => void;
}) {
  const isActive = isSelected;
  const effectivelyDisabled = disabled || isLocked;
  return (
    <motion.button
      type="button"
      disabled={disabled}
      whileTap={effectivelyDisabled ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.12 }}
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-center min-w-[40px] min-h-[36px] py-1.5 px-2.5 rounded-lg shrink-0 transition-colors border text-[13px]
        ${isLocked
          ? "bg-muted border-primary-border/80 text-muted-foreground cursor-not-allowed"
          : isActive
            ? "bg-primary text-white border-primary shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
            : "bg-primary-light border-primary-border text-primary hover:border-primary-border"
        }
        ${!isActive && isToday && !isLocked ? "ring-1 ring-primary/30" : ""}
        ${disabled ? "pointer-events-none opacity-70" : ""}
      `}
    >
      {status === "loading" && (
        <span
          className="absolute inset-0 rounded-lg after:absolute after:inset-0 after:rounded-lg after:bg-gradient-to-r after:from-transparent after:via-white/30 after:to-transparent after:animate-shimmer pointer-events-none"
          aria-hidden
        />
      )}
      <span className="font-medium relative z-0 opacity-90">{dayLabel}</span>
      <span className="font-semibold leading-tight relative z-0">{dateNum}</span>
    </motion.button>
  );
}
const mealTypes = [
  { id: "breakfast", label: "Завтрак", emoji: "🍽", time: "8:30" },
  { id: "lunch", label: "Обед", emoji: "🍽", time: "12:00" },
  { id: "snack", label: "Полдник", emoji: "🍽", time: "15:00" },
  { id: "dinner", label: "Ужин", emoji: "🍽", time: "18:00" },
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

/** Короткая дата для карточки: "15 фев" */
function formatShortDate(date: Date): string {
  return `${date.getDate()} ${date.toLocaleDateString("ru-RU", { month: "short" })}`;
}

export default function MealPlanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { selectedMember, members, selectedMemberId, isFreeLocked, isLoading: isMembersLoading } = useFamily();
  const { hasAccess, subscriptionStatus, planInitialized, setPlanInitialized } = useSubscription();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const isFree = !hasAccess;
  const statusBadgeLabel = subscriptionStatus === "premium" ? "Premium" : subscriptionStatus === "trial" ? "Триал" : "Free";

  // Не открываем paywall автоматически при заходе на План — Free может использовать дневной план (шаблон).
  const isFamilyMode = !isFree && selectedMemberId === "family";
  const mealPlanMemberId = isFree && selectedMemberId === "family"
    ? (members[0]?.id ?? undefined)
    : (isFamilyMode ? null : (selectedMemberId || undefined));
  const memberDataForPlan = useMemo(() => {
    if (isFamilyMode && members.length > 0) {
      const youngest = [...members].sort((a, b) => (a.age_months ?? 0) - (b.age_months ?? 0))[0];
      const allAllergies = Array.from(new Set(members.flatMap((c) => c.allergies ?? [])));
      const rawPrefs = members.flatMap((c) => (c as { preferences?: string[] }).preferences ?? []);
      const familyPreferences = Array.from(new Set(rawPrefs.map((p) => String(p).trim()).filter(Boolean)));
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

  const MUTED_WEEK_STORAGE_KEY = "mealPlan_mutedWeekKey";
  const [mutedWeekKey, setMutedWeekKey] = useState<string | null>(() => {
    if (typeof localStorage === "undefined") return null;
    const stored = localStorage.getItem(MUTED_WEEK_STORAGE_KEY);
    const currentStart = getRollingStartKey();
    return stored === currentStart ? stored : null;
  });
  const setMutedWeekKeyAndStorage = useCallback((key: string | null) => {
    setMutedWeekKey(key);
    if (typeof localStorage === "undefined") return;
    if (key) localStorage.setItem(MUTED_WEEK_STORAGE_KEY, key);
    else localStorage.removeItem(MUTED_WEEK_STORAGE_KEY);
  }, []);

  const starterProfile = memberDataForPlan ? { allergies: memberDataForPlan.allergies, preferences: memberDataForPlan.preferences } : null;
  const { getMealPlans, getMealPlansByDate, getMealPlanRowExists, clearWeekPlan, deleteMealPlan } = useMealPlans(mealPlanMemberId, starterProfile, { mutedWeekKey });

  const memberIdForPlan = mealPlanMemberId ?? null;
  const planGenType = isFree ? "day" : "week";
  const {
    job: planJob,
    isRunning: isPlanGenerating,
    progressDone: planProgressDone,
    progressTotal: planProgressTotal,
    errorText: planErrorText,
    startGeneration: startPlanGeneration,
    runPoolUpgrade,
    cancelJob: cancelPlanJob,
    refetchJob,
  } = usePlanGenerationJob(memberIdForPlan, planGenType);

  const [poolUpgradeLoading, setPoolUpgradeLoading] = useState(false);
  const isAnyGenerating = isPlanGenerating || poolUpgradeLoading;

  useEffect(() => {
    setPoolUpgradeLoading(false);
    setReplacingSlotKey(null);
  }, [mealPlanMemberId]);

  const startKey = getRollingStartKey();
  const endKey = getRollingEndKey();
  const rollingDates = useMemo(() => getRolling7Dates(), [startKey]);
  const todayKey = formatLocalDate(new Date());

  const initialPlanRanRef = useRef(false);

  const [replacingSlotKey, setReplacingSlotKey] = useState<string | null>(null);
  const [clearSheetOpen, setClearSheetOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState<"day" | "week" | null>(null);
  /** Локальная коррекция week-индикаторов до завершения refetch после очистки дня/недели. dayKey -> true = считать день пустым. */
  const [pendingClears, setPendingClears] = useState<Record<string, true>>({});
  /** Один раз за сессию: glow у CTA "Подобрать рецепты" при первом заходе на вкладку */
  const ctaGlowShownRef = useRef(false);
  const [ctaGlow, setCtaGlow] = useState(false);

  const planJobNotifiedRef = useRef<string | null>(null);
  const planJobWasRunningRef = useRef<string | null>(null);
  const lastProgressRef = useRef<number>(-1);
  const longRunToastRef = useRef(false);

  useEffect(() => {
    if (!planJob) return;
    if (planJob.status === "running") {
      planJobWasRunningRef.current = planJob.id;
      const prev = lastProgressRef.current;
      if (prev !== planJob.progress_done) {
        lastProgressRef.current = planJob.progress_done;
        const t = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
        }, 300);
        return () => clearTimeout(t);
      }
      const createdAt = planJob.created_at ? new Date(planJob.created_at).getTime() : 0;
      const elapsed = createdAt ? Date.now() - createdAt : 0;
      const limit = planGenType === "week" ? 6 * 60 * 1000 : 3 * 60 * 1000;
      if (elapsed > limit && !longRunToastRef.current) {
        longRunToastRef.current = true;
        toast({ description: "Генерация занимает больше обычного. Продолжаем в фоне." });
      }
      return;
    }
    if (user?.id) setStoredJobId(user.id, memberIdForPlan, startKey, null);
    lastProgressRef.current = -1;
    longRunToastRef.current = false;
    queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
    if (planJobNotifiedRef.current === planJob.id) return;
    const wasRunning = planJobWasRunningRef.current === planJob.id;
    planJobNotifiedRef.current = planJob.id;
    if (planJob.status === "done" && wasRunning) {
      toast({ description: planGenType === "week" ? "План на 7 дней готов" : "План на день готов" });
    } else if (planJob.status === "error" && wasRunning) {
      const errDesc =
        planErrorText === "timeout_stalled"
          ? "Генерация заняла слишком много времени. Попробуйте снова."
          : planErrorText === "cancelled_by_user"
            ? "Генерация отменена."
            : planErrorText ?? "Не удалось сгенерировать план";
      toast({ variant: planErrorText === "cancelled_by_user" ? "default" : "destructive", title: planErrorText === "cancelled_by_user" ? undefined : "Ошибка генерации", description: errDesc });
    }
  }, [planJob?.id, planJob?.status, planJob?.progress_done, planJob?.created_at, planGenType, planErrorText, queryClient, user?.id, memberIdForPlan, startKey, toast]);

  // При заходе на страницу — resume polling если есть сохранённый job
  useEffect(() => {
    if (!user?.id) return;
    const stored = getStoredJobId(user.id, memberIdForPlan, startKey);
    if (stored) refetchJob();
  }, [user?.id, memberIdForPlan, startKey, refetchJob]);
  const [selectedDay, setSelectedDay] = useState(0);

  // При смене дня (startKey) сбрасываем мьют, чтобы не тянуть его с прошлой недели
  useEffect(() => {
    if (!mutedWeekKey) return;
    if (mutedWeekKey !== startKey) {
      setMutedWeekKey(null);
      if (typeof localStorage !== "undefined") localStorage.removeItem(MUTED_WEEK_STORAGE_KEY);
    }
  }, [startKey, mutedWeekKey]);

  const { replaceMealSlotAuto, getFreeSwapUsedForDay } = useReplaceMealSlot(
    memberIdForPlan,
    { startKey, endKey, hasAccess }
  );

  useEffect(() => {
    if (isPlanDebug() || isPerf()) {
      console.log("[ROLLING range]", { startKey, endKey });
    }
  }, [startKey, endKey]);

  const prevPathnameRef = useRef(location.pathname);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const isOnPlan = location.pathname === "/meal-plan";
    const wasOnPlan = prevPathnameRef.current === "/meal-plan";
    prevPathnameRef.current = location.pathname;
    if (isOnPlan && !wasOnPlan) {
      setSelectedDay(0);
      requestAnimationFrame(() => scrollContainerRef.current?.scrollTo(0, 0));
    }
  }, [location.pathname]);

  /** Один раз за сессию: лёгкий glow CTA при первом показе вкладки План */
  useEffect(() => {
    if (location.pathname !== "/meal-plan" || ctaGlowShownRef.current) return;
    ctaGlowShownRef.current = true;
    setCtaGlow(true);
    const t = setTimeout(() => setCtaGlow(false), 1200);
    return () => clearTimeout(t);
  }, [location.pathname]);

  const todayIndex = useMemo(() => rollingDates.findIndex((d) => formatLocalDate(d) === todayKey), [rollingDates, todayKey]);

  useEffect(() => {
    if (isFree && todayIndex >= 0 && selectedDay !== todayIndex) {
      if (import.meta.env.DEV) console.log("[DEBUG] free day locked to today");
      setSelectedDay(todayIndex);
    }
  }, [isFree, todayIndex, selectedDay]);

  const selectedDate = rollingDates[selectedDay];
  const selectedDayKey = formatLocalDate(selectedDate);

  /** Ключи кэша планов для optimistic update после replace_slot. */
  const profileKey = useMemo(() => {
    const p = memberDataForPlan;
    if (!p) return null;
    return [
      [...(p.allergies ?? [])].sort().join(","),
      (p.preferences ?? []).map((s) => String(s).trim().toLowerCase()).join("|"),
    ].join(";");
  }, [memberDataForPlan]);
  const mealPlansKeyWeek = useMemo(
    () => mealPlansKey({ userId: user?.id, memberId: mealPlanMemberId, start: formatLocalDate(rollingDates[0]), end: formatLocalDate(rollingDates[6]), profileKey, mutedWeekKey }),
    [user?.id, mealPlanMemberId, rollingDates, profileKey, mutedWeekKey]
  );
  const mealPlansKeyDay = useMemo(
    () => mealPlansKey({ userId: user?.id, memberId: mealPlanMemberId, start: selectedDayKey, profileKey, mutedWeekKey }),
    [user?.id, mealPlanMemberId, selectedDayKey, profileKey, mutedWeekKey]
  );

  const { data: dayMealPlans = [], isLoading } = getMealPlansByDate(selectedDate);
  const { data: rowExistsData } = getMealPlanRowExists(selectedDate);
  const isEmptyDay = !!(rowExistsData?.exists && rowExistsData?.isEmpty);

  const renderStartRef = useRef(0);
  if (isPerf()) renderStartRef.current = performance.now();
  useEffect(() => {
    if (isPlanDebug() || isPerf()) {
      console.log("[PLAN render]", { selectedDayKey, mealsCount: dayMealPlans.length });
    }
    if (isPerf()) {
      const start = renderStartRef.current;
      requestAnimationFrame(() => {
        const elapsed = performance.now() - start;
        console.log("[perf] render list (rAF)", elapsed.toFixed(2), "ms");
      });
    }
  }, [selectedDayKey, dayMealPlans.length]);

  /** Только валидные recipe_id для превью; broken-слоты (recipe_id null) не попадают в dayMealPlans. */
  const recipeIdsForPreviews = useMemo(
    () => dayMealPlans.map((m) => m.recipe_id).filter((id): id is string => !!id),
    [dayMealPlans]
  );
  const { previews, isLoading: isLoadingPreviews } = useRecipePreviewsByIds(recipeIdsForPreviews);

  const { data: weekPlans = [], isLoading: isWeekPlansLoading } = getMealPlans(rollingDates[0], rollingDates[6]);
  const dayKeys = useMemo(() => rollingDates.map((d) => formatLocalDate(d)), [rollingDates]);
  const hasMealsByDayIndex = useMemo(
    () =>
      dayKeys.map((dayKey) => {
        if (pendingClears[dayKey]) return false;
        return weekPlans.some((p) => p.planned_date === dayKey);
      }),
    [dayKeys, weekPlans, pendingClears]
  );
  const missingDayKeys = useMemo(
    () => dayKeys.filter((_, i) => !hasMealsByDayIndex[i]),
    [dayKeys, hasMealsByDayIndex]
  );

  /** Мемоизированные exclude для replace_slot, чтобы не пересчитывать на каждый рендер. */
  const replaceExcludeRecipeIds = useMemo(() => {
    const t0 = isPerf() ? performance.now() : 0;
    const out = [...new Set(weekPlans.map((p) => p.recipe_id).filter(Boolean))] as string[];
    if (isPerf() && t0) {
      const dur = performance.now() - t0;
      console.log("[perf] excludes build (ids)", dur.toFixed(2), "ms");
    }
    return out;
  }, [weekPlans]);
  const replaceExcludeTitleKeys = useMemo(
    () => [...new Set(weekPlans.map((p) => p.recipe?.title).filter(Boolean))] as string[],
    [weekPlans]
  );

  const hasDbWeekPlan = weekPlans.some((p) => !p.isStarter);
  const hasAnyWeekPlan = weekPlans.length > 0;
  /** Диапазон полностью пустой: нет DB и starter скрыт. */
  const isCompletelyEmpty = mutedWeekKey === startKey && !hasAnyWeekPlan;

  /** Индекс дня, который сейчас генерируется (по прогрессу job). */
  const generatingDayIndex = isPlanGenerating && planProgressTotal > 0 ? planProgressDone : -1;
  const getDayStatus = (index: number): DayTabStatus => {
    if (isPlanGenerating && index === planProgressDone) return "loading";
    if (hasMealsByDayIndex[index] || (isPlanGenerating && index < planProgressDone)) return "done";
    return "idle";
  };

  useEffect(() => {
    if (isPlanDebug() || isPerf()) {
      console.log("[ROLLING]", { missingCount: missingDayKeys.length });
    }
  }, [startKey, endKey, missingDayKeys]);

  /** Один раз при первом заходе: если план ещё не инициализирован и на сегодня нет meal_plan из БД — сгенерировать 1 день. */
  useEffect(() => {
    if (location.pathname !== "/meal-plan" || !user?.id || planInitialized || initialPlanRanRef.current) return;
    if (isAnyGenerating || isWeekPlansLoading) return;
    const hasDbPlanForToday = weekPlans.some((p) => p.planned_date === todayKey && !p.isStarter);
    if (hasDbPlanForToday) return;
    initialPlanRanRef.current = true;
    startPlanGeneration({
      type: "day",
      member_id: memberIdForPlan,
      member_data: memberDataForPlan,
      day_key: todayKey,
    })
      .then(() => setPlanInitialized())
      .catch(() => {
        initialPlanRanRef.current = false;
      });
  }, [
    location.pathname,
    user?.id,
    planInitialized,
    isWeekPlansLoading,
    isAnyGenerating,
    weekPlans,
    todayKey,
    memberIdForPlan,
    memberDataForPlan,
    startPlanGeneration,
    setPlanInitialized,
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

  const planDebug = isPlanDebug();

  /** Строка статуса под CTA: "N приёмов пищи" / "План на сегодня готов" / "Заполним день за 30 секунд" */
  const heroStatusText = useMemo(() => {
    const filledCount = dayMealPlans.filter((p) => p.recipe_id).length;
    const isToday = selectedDayKey === todayKey;
    const todaySuffix = isToday ? " на сегодня" : "";
    if (filledCount === 0) return isToday ? "Заполним день за 30 секунд" : "Нет блюд на этот день";
    if (filledCount === 4) return isToday ? "План на сегодня готов" : "План готов";
    const word = filledCount === 1 ? "приём" : filledCount >= 2 && filledCount <= 4 ? "приёма" : "приёмов";
    return `${filledCount} ${word} пищи${todaySuffix}`;
  }, [dayMealPlans, selectedDayKey, todayKey]);

  const { dbCount: dayDbCount, aiCount: dayAiCount } = useMemo(() => {
    let db = 0;
    let ai = 0;
    for (const item of dayMealPlans) {
      if (item.plan_source === "pool") db++;
      else if (item.plan_source === "ai") ai++;
      else {
        const src = previews[item.recipe_id ?? ""]?.source;
        if (src === "seed" || src === "manual") db++;
        else if (item.recipe_id) ai++;
      }
    }
    return { dbCount: db, aiCount: ai };
  }, [dayMealPlans, previews]);

  const showNoProfile = members.length === 0 && !isMembersLoading;
  const showEmptyFamily = isFamilyMode && members.length === 0 && !isMembersLoading;

  if ((isPlanDebug() || isPerf()) && (typeof window !== "undefined")) {
    console.log("[PLAN state]", {
      selectedDayKey,
      selectedMemberId,
      mealPlanMemberId,
    });
  }

  if (isMembersLoading) {
    return (
      <MobileLayout
        headerCenter={
          <span className="text-typo-title font-semibold text-foreground tracking-tight">
            Mom Recipes <span className="text-primary" aria-hidden>🌿</span>
          </span>
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
        headerCenter={
          <span className="text-typo-title font-semibold text-foreground tracking-tight">
            Mom Recipes <span className="text-primary" aria-hidden>🌿</span>
          </span>
        }
      >
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
              <Button className="bg-primary hover:opacity-90 text-white border-0 shadow-soft rounded-2xl" onClick={() => navigate("/profile")}>
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
      headerCenter={
        <span className="text-typo-title font-semibold text-foreground tracking-tight">
          Mom Recipes <span className="text-primary" aria-hidden>🌿</span>
        </span>
      }
    >
      <div className="flex flex-col min-h-0 flex-1 px-4 relative">
        {/* Content wrapper: один скролл + subtle pattern */}
        <div ref={scrollContainerRef} className="plan-page-bg relative flex-1 min-h-0 overflow-y-auto">
          {/* 1) Hero: заголовок, дата + селектор профиля, бейдж, действия */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="rounded-2xl bg-primary-light border border-primary-border shadow-[0_2px_16px_-4px_rgba(0,0,0,0.06),0_4px_24px_-8px_rgba(110,127,59,0.06)] p-5 sm:p-6 mb-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-plan-hero-title font-bold text-text-main leading-tight tracking-tight">
                  {selectedDayKey === todayKey
                    ? "Сегодня, " + formatDayHeader(selectedDate).split(", ")[0].toLowerCase()
                    : formatDayHeader(selectedDate).split(", ")[0] + ", " + formatShortDate(selectedDate)}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="text-plan-subheader font-medium text-muted-foreground">
                    {formatShortDate(selectedDate)}
                  </span>
                  {planDebug && (dayDbCount > 0 || dayAiCount > 0) && (
                    <span className="text-typo-caption text-slate-500 font-medium">
                      DB: {dayDbCount} | AI: {dayAiCount}
                    </span>
                  )}
                  {members.length > 0 && (
                    <MemberSelectorButton className="shrink-0" />
                  )}
                </div>
              </div>
              <span
                className={`
                  shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md
                  ${subscriptionStatus === "premium" ? "bg-primary-pill text-primary" : subscriptionStatus === "trial" ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}
                `}
              >
                {statusBadgeLabel}
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className={`rounded-2xl bg-primary hover:opacity-90 text-white border-0 transition-shadow duration-300 ${ctaGlow ? "shadow-[0_0_0_3px_rgba(110,127,59,0.25),0_4px_20px_-4px_rgba(110,127,59,0.3)]" : "shadow-soft"}`}
                  disabled={isAnyGenerating || (isFree && todayIndex < 0)}
                  onClick={async () => {
                    if (isAnyGenerating) return;
                    if (isFree) {
                      try {
                        await startPlanGeneration({
                          type: "day",
                          member_id: memberIdForPlan,
                          member_data: memberDataForPlan,
                          day_key: todayKey,
                        });
                      } catch (e: unknown) {
                        toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "Не удалось заполнить день" });
                      }
                      return;
                    }
                    setPoolUpgradeLoading(true);
                    try {
                      const result = await runPoolUpgrade({
                        type: "day",
                        member_id: memberIdForPlan,
                        member_data: memberDataForPlan,
                        day_key: selectedDayKey,
                      });
                      queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                      const aiFallback = result.aiFallbackCount ?? 0;
                      const desc = aiFallback > 0
                        ? `Подобрано из базы: ${result.replacedCount}, добавлено AI: ${aiFallback}`
                        : `Подобрано: ${result.replacedCount} из ${result.totalSlots ?? 4}`;
                      toast({ title: "Заполнить день", description: desc });
                    } catch (e: unknown) {
                      toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "Не удалось заполнить день" });
                    } finally {
                      setPoolUpgradeLoading(false);
                    }
                  }}
                >
                  <Sparkles className="w-4 h-4 mr-1.5 shrink-0" />
                  {isAnyGenerating ? "Подбираем…" : "Заполнить день"}
                </Button>
                <button
                  type="button"
                  onClick={() => setClearSheetOpen(true)}
                  className="text-plan-secondary font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-70 flex items-center gap-1.5"
                  disabled={isAnyGenerating}
                  aria-label="Очистить день или неделю"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  Очистить
                </button>
              </div>
              <div className="flex flex-col gap-0.5 w-full sm:w-auto">
                <Button
                  size="sm"
                  variant="outline"
                  className={`rounded-2xl border-primary-border w-full sm:w-auto ${ctaGlow ? "shadow-[0_0_0_2px_rgba(110,127,59,0.2)]" : ""} ${isAnyGenerating ? "opacity-70 cursor-wait" : ""}`}
                  disabled={isAnyGenerating}
                  onClick={async () => {
                    if (isAnyGenerating) {
                      toast({ description: "Идёт подбор рецептов, подождите…" });
                      return;
                    }
                    if (isFree) {
                      setPaywallCustomMessage("План питания на 7 дней доступен в Premium.");
                      setShowPaywall(true);
                      return;
                    }
                    setPoolUpgradeLoading(true);
                  try {
                    const result = await runPoolUpgrade({
                      type: "week",
                      member_id: memberIdForPlan,
                      member_data: memberDataForPlan,
                      start_key: getRollingStartKey(),
                      day_keys: getRollingDayKeys(),
                    });
                    setMutedWeekKeyAndStorage(null);
                    queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                    const aiFallback = result.aiFallbackCount ?? 0;
                    const desc = aiFallback > 0
                      ? `Подобрано из базы: ${result.replacedCount}, добавлено AI: ${aiFallback}`
                      : `Подобрано: ${result.replacedCount} из ${result.totalSlots ?? 28}`;
                    toast({ title: "Заполнить всю неделю", description: desc });
                  } catch (e: unknown) {
                    toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "Не удалось заполнить неделю" });
                  } finally {
                    setPoolUpgradeLoading(false);
                  }
                }}
                >
                  <span className="mr-1.5 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/15 text-primary">Premium</span>
                  <Sparkles className="w-4 h-4 mr-1.5 shrink-0" />
                  {isAnyGenerating ? "Подбираем…" : "Заполнить всю неделю"}
                </Button>
                <p className="text-plan-secondary text-muted-foreground text-xs">
                  Экономит до 30 минут планирования
                </p>
              </div>
              <p className="text-plan-secondary font-medium text-muted-foreground mt-0.5" aria-live="polite">
                {heroStatusText}
              </p>
              {(memberDataForPlan?.allergies?.length || memberDataForPlan?.preferences?.length) ? (
                <p className="text-plan-secondary text-muted-foreground mt-0.5">
                  {[
                    memberDataForPlan?.allergies?.length
                      ? `Аллергии: ${memberDataForPlan.allergies.join(", ")}`
                      : null,
                    memberDataForPlan?.preferences?.length
                      ? `Предпочтения: ${memberDataForPlan.preferences.join(", ")}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          </motion.div>

          {/* 2) Чипсы дней — компактно, вторично */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none" style={{ scrollbarWidth: "none" }}>
            {rollingDates.map((date, index) => {
              const dayKey = formatLocalDate(date);
              const isDayLockedForFree = isFree && dayKey !== todayKey;
              return (
                <DayTabButton
                  key={dayKey}
                  dayLabel={getDayLabel(date)}
                  dateNum={date.getDate()}
                  isSelected={selectedDay === index}
                  status={getDayStatus(index)}
                  isToday={dayKey === todayKey}
                  disabled={false}
                  isLocked={isDayLockedForFree}
                  onClick={() => {
                    if (isDayLockedForFree) {
                      toast({
                        title: "Доступно в Premium",
                        description: "План на 7 дней — только для подписчиков.",
                      });
                      return;
                    }
                    setSelectedDay(index);
                  }}
                />
              );
            })}
          </div>

          {isAnyGenerating && (
            <div className="flex items-center justify-between gap-3 mt-1 -mx-4 px-4">
              <p className="text-typo-caption text-amber-700 font-medium">
                {poolUpgradeLoading
                  ? "Подбираем из базы…"
                  : planProgressTotal > 0
                    ? `Генерируем… ${planProgressDone}/${planProgressTotal}`
                    : "Генерируем…"}
              </p>
              {isPlanGenerating && (
                <button
                  type="button"
                  onClick={() => cancelPlanJob()}
                  className="text-typo-caption text-amber-800 hover:text-amber-900 underline"
                >
                  Отменить
                </button>
              )}
            </div>
          )}

          {/* 3) Приёмы пищи: empty state (EMPTY_DAY) или слоты */}
          {isEmptyDay ? (
            <div className="mt-4 rounded-2xl border border-primary-border/60 bg-primary-light/30 p-6 text-center">
              <p className="text-4xl mb-2" aria-hidden>✨</p>
              <h3 className="text-plan-hero-title font-semibold text-foreground mb-1">День пустой</h3>
              <p className="text-plan-secondary text-muted-foreground text-sm mb-5">
                Нажмите «Заполнить день», чтобы подобрать блюда с учётом аллергий и предпочтений.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  size="sm"
                  className="rounded-2xl bg-primary hover:opacity-90 text-white border-0 shadow-soft"
                  disabled={isAnyGenerating || (isFree && todayIndex < 0)}
                  onClick={async () => {
                    if (isAnyGenerating) return;
                    if (isFree) {
                      try {
                        await startPlanGeneration({ type: "day", member_id: memberIdForPlan, member_data: memberDataForPlan, day_key: todayKey });
                      } catch (e: unknown) {
                        toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "Не удалось заполнить день" });
                      }
                      return;
                    }
                    setPoolUpgradeLoading(true);
                    try {
                      const result = await runPoolUpgrade({ type: "day", member_id: memberIdForPlan, member_data: memberDataForPlan, day_key: selectedDayKey });
                      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "meal_plans_v2" });
                      const desc = (result.aiFallbackCount ?? 0) > 0 ? `Подобрано из базы: ${result.replacedCount}, добавлено AI: ${result.aiFallbackCount}` : `Подобрано: ${result.replacedCount} из ${result.totalSlots ?? 4}`;
                      toast({ title: "Заполнить день", description: desc });
                    } catch (e: unknown) {
                      toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "Не удалось заполнить день" });
                    } finally {
                      setPoolUpgradeLoading(false);
                    }
                  }}
                >
                  <Sparkles className="w-4 h-4 mr-1.5 shrink-0" />
                  Заполнить день
                </Button>
                {hasAccess && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-2xl border-primary-border"
                    disabled={isAnyGenerating}
                    onClick={async () => {
                      if (isAnyGenerating) return;
                      setPoolUpgradeLoading(true);
                      try {
                        const result = await runPoolUpgrade({ type: "week", member_id: memberIdForPlan, member_data: memberDataForPlan, start_key: getRollingStartKey(), day_keys: getRollingDayKeys() });
                        setMutedWeekKeyAndStorage(null);
                        queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "meal_plans_v2" });
                        const desc = (result.aiFallbackCount ?? 0) > 0 ? `Подобрано из базы: ${result.replacedCount}, добавлено AI: ${result.aiFallbackCount}` : `Подобрано: ${result.replacedCount} из ${result.totalSlots ?? 28}`;
                        toast({ title: "Заполнить всю неделю", description: desc });
                      } catch (e: unknown) {
                        toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "Не удалось заполнить неделю" });
                      } finally {
                        setPoolUpgradeLoading(false);
                      }
                    }}
                  >
                    Заполнить неделю
                  </Button>
                )}
              </div>
            </div>
          ) : (
          <div className="mt-4 space-y-4 pb-6">
            {mealTypes.map((slot) => {
              const plannedMeal = mealsByType[slot.id];
              const recipe = plannedMeal ? getPlannedMealRecipe(plannedMeal) : null;
              const recipeId = plannedMeal ? getPlannedMealRecipeId(plannedMeal) : null;
              const hasDish = !!(plannedMeal && recipeId && recipe?.title);
              return (
                <div key={slot.id}>
                  <p className="text-plan-meal-label font-semibold text-foreground mb-1.5">{slot.label}</p>
                  {hasDish ? (
                    <MealCard
                      mealType={plannedMeal!.meal_type}
                      recipeTitle={recipe!.title}
                      recipeId={recipeId!}
                      mealTypeLabel={slot.label}
                      compact
                      isLoadingPreviews={isLoadingPreviews}
                      cookTimeMinutes={previews[recipeId!]?.cookTimeMinutes}
                      ingredientNames={previews[recipeId!]?.ingredientNames}
                      ingredientTotalCount={previews[recipeId!]?.ingredientTotalCount}
                      hint={
                        (() => {
                          const p = previews[recipeId!];
                          if (!p) return undefined;
                          const tip = (hasAccess && p.chefAdvice?.trim()) ? p.chefAdvice : (p.advice?.trim() ?? p.chefAdvice?.trim());
                          return tip ?? undefined;
                        })()
                      }
                      isReplaceLoading={replacingSlotKey === `${selectedDayKey}_${slot.id}`}
                      onReplace={async () => {
                        if (isAnyGenerating) {
                          toast({ description: "Идёт генерация плана…" });
                          return;
                        }
                        if (isFree) {
                          setPaywallCustomMessage("Замена любого блюда доступна в Premium.");
                          setShowPaywall(true);
                          return;
                        }
                        const slotKey = `${selectedDayKey}_${slot.id}`;
                        if (replacingSlotKey != null) return;
                        setReplacingSlotKey(slotKey);
                        try {
                          const result = await replaceMealSlotAuto({
                            dayKey: selectedDayKey,
                            mealType: slot.id,
                            excludeRecipeIds: replaceExcludeRecipeIds,
                            excludeTitleKeys: replaceExcludeTitleKeys,
                            memberData: memberDataForPlan
                              ? {
                                allergies: memberDataForPlan.allergies,
                                preferences: memberDataForPlan.preferences,
                                age_months: memberDataForPlan.age_months,
                              }
                              : undefined,
                            isFree,
                          });
                          if (result.ok) {
                            if (result.newRecipeId === recipeId) {
                              toast({ description: "Нет других вариантов" });
                              return;
                            }
                            applyReplaceSlotToPlanCache(queryClient, { mealPlansKeyWeek, mealPlansKeyDay }, {
                              dayKey: selectedDayKey,
                              mealType: slot.id,
                              newRecipeId: result.newRecipeId,
                              title: result.title,
                              plan_source: result.plan_source,
                            }, mealPlanMemberId ?? null);
                            toast({
                              description: result.pickedSource === "ai" ? "Подбираем новый вариант…" : "Блюдо заменено",
                            });
                          } else {
                            const err = "error" in result ? result.error : "";
                            if (err === "limit") {
                              toast({
                                variant: "destructive",
                                title: "Лимит",
                                description: "1 замена в день (Free). В Premium — без ограничений.",
                              });
                            } else {
                              toast({
                                variant: "destructive",
                                title: "Не удалось заменить",
                                description: err === "unauthorized" ? "Нужна авторизация" : err,
                              });
                            }
                          }
                        } catch (e: unknown) {
                          toast({
                            variant: "destructive",
                            title: "Ошибка",
                            description: e instanceof Error ? e.message : "Не удалось заменить",
                          });
                        } finally {
                          setReplacingSlotKey(null);
                        }
                      }}
                      debugSource={
                        planDebug
                          ? (plannedMeal as { plan_source?: "pool" | "ai" })?.plan_source === "pool"
                            ? "db"
                            : (plannedMeal as { plan_source?: "pool" | "ai" })?.plan_source === "ai"
                              ? "ai"
                              : previews[recipeId!]?.source === "seed" || previews[recipeId!]?.source === "manual"
                                ? "db"
                                : "ai"
                          : undefined
                      }
                      onDelete={hasAccess ? async () => {
                        const planSlotId = plannedMeal.id;
                        if (!planSlotId) return;
                        try {
                          await deleteMealPlan(planSlotId);
                          queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                          toast({ title: "Блюдо удалено", description: "Убрано из плана на день" });
                        } catch (e: unknown) {
                          toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "Не удалось удалить" });
                        }
                      } : undefined}
                    />
                  ) : isLoading || isAnyGenerating || replacingSlotKey === `${selectedDayKey}_${slot.id}` ? (
                    <MealCardSkeleton />
                  ) : (
                    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/60 min-h-[48px] justify-center px-4 py-3">
                      <p className="text-plan-secondary text-muted-foreground">Пока нет блюда</p>
                      {!isAnyGenerating && (
                        <button
                          type="button"
                          className="text-typo-caption text-primary hover:opacity-80 font-medium w-fit"
                          onClick={async () => {
                            if (replacingSlotKey != null) return;
                            if (isFree) {
                              setPaywallCustomMessage("Подбор рецептов и замена блюд — в Premium.");
                              setShowPaywall(true);
                              return;
                            }
                            const slotKey = `${selectedDayKey}_${slot.id}`;
                            setReplacingSlotKey(slotKey);
                            try {
                              const result = await replaceMealSlotAuto({
                                dayKey: selectedDayKey,
                                mealType: slot.id,
                                excludeRecipeIds: replaceExcludeRecipeIds,
                                excludeTitleKeys: replaceExcludeTitleKeys,
                                memberData: memberDataForPlan
                                  ? {
                                    allergies: memberDataForPlan.allergies,
                                    preferences: memberDataForPlan.preferences,
                                    age_months: memberDataForPlan.age_months,
                                  }
                                  : undefined,
                                isFree,
                              });
                              if (result.ok) {
                                applyReplaceSlotToPlanCache(queryClient, { mealPlansKeyWeek, mealPlansKeyDay }, {
                                  dayKey: selectedDayKey,
                                  mealType: slot.id,
                                  newRecipeId: result.newRecipeId,
                                  title: result.title,
                                  plan_source: result.plan_source,
                                }, mealPlanMemberId ?? null);
                                queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                                toast({
                                  description: result.pickedSource === "ai" ? "Рецепт подобран (AI)" : "Рецепт подобран из базы",
                                });
                              } else {
                                const err = "error" in result ? result.error : "";
                                if (err === "limit") {
                                  toast({
                                    variant: "destructive",
                                    title: "Лимит",
                                    description: "1 замена в день (Free). В Premium — без ограничений.",
                                  });
                                } else {
                                  toast({
                                    variant: "destructive",
                                    title: "Не удалось подобрать",
                                    description: err === "unauthorized" ? "Нужна авторизация" : err,
                                  });
                                }
                              }
                            } catch (e: unknown) {
                              toast({
                                variant: "destructive",
                                title: "Ошибка",
                                description: e instanceof Error ? e.message : "Не удалось подобрать рецепт",
                              });
                            } finally {
                              setReplacingSlotKey(null);
                            }
                          }}
                        >
                          Подобрать рецепт
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}

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
                  className="w-fit rounded-xl"
                  onClick={async () => {
                    setPoolUpgradeLoading(true);
                    try {
                      const result = await runPoolUpgrade({
                        type: "day",
                        member_id: memberIdForPlan,
                        member_data: memberDataForPlan,
                        day_key: formatLocalDate(rollingDates[6]),
                      });
                      queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                      const aiFallback = result.aiFallbackCount ?? 0;
                      const desc = aiFallback > 0
                        ? `Подобрано из базы: ${result.replacedCount}, добавлено AI: ${aiFallback}`
                        : `Подобрано: ${result.replacedCount} из ${result.totalSlots ?? 4}`;
                      toast({ title: "Подобрать рецепты", description: desc });
                    } catch (e: unknown) {
                      toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "Не удалось подобрать рецепты" });
                    } finally {
                      setPoolUpgradeLoading(false);
                    }
                  }}
                >
                  Заполнить день
                </Button>
              </div>
            )}
        </div>
      </div>

      <Sheet open={clearSheetOpen} onOpenChange={setClearSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left pb-4">
            <SheetTitle>Очистить</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-2 pb-6">
            <button
              type="button"
              className="w-full py-3 px-4 rounded-xl text-left font-medium text-foreground bg-muted/50 hover:bg-muted transition-colors"
              onClick={() => {
                setClearSheetOpen(false);
                setClearConfirm("day");
              }}
              aria-label="Очистить меню на этот день"
            >
              Очистить день
            </button>
            <button
              type="button"
              disabled={!hasAccess}
              className={`w-full py-3 px-4 rounded-xl text-left font-medium transition-colors ${hasAccess ? "text-foreground bg-muted/50 hover:bg-muted" : "text-muted-foreground cursor-not-allowed opacity-70"}`}
              onClick={() => {
                if (!hasAccess) return;
                setClearSheetOpen(false);
                setClearConfirm("week");
              }}
              aria-label="Очистить меню на всю неделю"
              title={!hasAccess ? "Доступно в Premium" : undefined}
            >
              Очистить неделю
              {!hasAccess && <span className="block text-xs font-normal text-muted-foreground mt-0.5">Доступно в Premium</span>}
            </button>
            <button
              type="button"
              className="w-full py-3 px-4 rounded-xl text-left font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
              onClick={() => setClearSheetOpen(false)}
            >
              Отмена
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={clearConfirm !== null} onOpenChange={(open) => !open && setClearConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{clearConfirm === "week" ? "Очистить меню на всю неделю?" : "Очистить меню на этот день?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {clearConfirm === "week" ? "Все блюда на 7 дней будут удалены. Это действие нельзя отменить." : "Все блюда на выбранный день будут удалены."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const which = clearConfirm;
                if (!which || isAnyGenerating) return;
                setClearConfirm(null);
                const isDay = which === "day";
                const startDate = isDay ? selectedDate : rollingDates[0];
                const endDate = isDay ? selectedDate : rollingDates[6];
                const keysToClear = isDay ? [selectedDayKey] : dayKeys;
                setPendingClears((prev) => ({ ...prev, ...Object.fromEntries(keysToClear.map((k) => [k, true as const])) }));
                try {
                  await queryClient.cancelQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "meal_plans_v2" });
                  queryClient.setQueryData(mealPlansKeyDay, []);
                  await clearWeekPlan({ startDate, endDate });
                  await queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "meal_plans_v2" });
                  await queryClient.refetchQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "meal_plans_v2" });
                  toast({ title: isDay ? "День очищен" : "Неделя очищена", description: "Блюда удалены" });
                } catch (e: unknown) {
                  toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "Не удалось очистить" });
                } finally {
                  setPendingClears({});
                }
              }}
            >
              Очистить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileLayout>
  );
}
