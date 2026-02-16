import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Loader2, Sparkles, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMealPlans } from "@/hooks/useMealPlans";
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
import { formatLocalDate } from "@/utils/dateUtils";
import { getRolling7Dates, getRollingStartKey, getRollingEndKey, getRollingDayKeys } from "@/utils/dateRange";
import { Check } from "lucide-react";

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

/** Обновить кэш планов после replace_slot (optimistic update). */
function applyReplaceSlotToPlanCache(
  queryClient: ReturnType<typeof useQueryClient>,
  keys: { mealPlansKeyWeek: unknown[]; mealPlansKeyDay: unknown[] },
  payload: { dayKey: string; mealType: string; newRecipeId: string; title: string; plan_source: "pool" | "ai" }
) {
  const updater = (old: Array<{ planned_date: string; meal_type: string; recipe_id: string | null; recipe: { id: string; title: string } | null; plan_source?: string }> | undefined) => {
    if (!old) return old;
    return old.map((item) =>
      item.planned_date === payload.dayKey && item.meal_type === payload.mealType
        ? { ...item, recipe_id: payload.newRecipeId, recipe: { id: payload.newRecipeId, title: payload.title }, plan_source: payload.plan_source }
        : item
    );
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
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-center min-w-[40px] min-h-[36px] py-1.5 px-2.5 rounded-lg shrink-0 transition-colors border text-[13px]
        ${isLocked
          ? "bg-slate-50 border-slate-200/80 text-slate-400 cursor-not-allowed"
          : isActive
            ? "bg-emerald-600 text-white border-emerald-600 shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
            : "bg-white/80 border-slate-200/90 text-slate-600 hover:border-slate-300"
        }
        ${!isActive && isToday && !isLocked ? "ring-1 ring-emerald-400/50" : ""}
        ${disabled ? "pointer-events-none opacity-70" : ""}
      `}
    >
      {status === "loading" && (
        <span
          className="absolute inset-0 rounded-lg after:absolute after:inset-0 after:rounded-lg after:bg-gradient-to-r after:from-transparent after:via-white/30 after:to-transparent after:animate-shimmer pointer-events-none"
          aria-hidden
        />
      )}
      {status === "done" && !isActive && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-fade-in" aria-hidden />
      )}
      {status === "done" && isActive && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-white/90 animate-fade-in" aria-hidden />
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
  const { hasAccess, subscriptionStatus } = useSubscription();
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
  const { getMealPlans, getMealPlansByDate, clearWeekPlan } = useMealPlans(mealPlanMemberId, starterProfile, { mutedWeekKey });

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

  const startKey = getRollingStartKey();
  const endKey = getRollingEndKey();
  const rollingDates = useMemo(() => getRolling7Dates(), [startKey]);
  const todayKey = formatLocalDate(new Date());

  const AUTOFILL_STORAGE_KEY = "mealPlan_autofill_lastRunAt";
  const AUTOFILL_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 часов
  const autogenTriggeredRef = useRef(false);

  const [replacingSlotKey, setReplacingSlotKey] = useState<string | null>(null);

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
    () => ["meal_plans_v2", user?.id, mealPlanMemberId, formatLocalDate(rollingDates[0]), formatLocalDate(rollingDates[6]), profileKey, mutedWeekKey],
    [user?.id, mealPlanMemberId, rollingDates, profileKey, mutedWeekKey]
  );
  const mealPlansKeyDay = useMemo(
    () => ["meal_plans_v2", user?.id, mealPlanMemberId, selectedDayKey, profileKey, mutedWeekKey],
    [user?.id, mealPlanMemberId, selectedDayKey, profileKey, mutedWeekKey]
  );

  const { data: dayMealPlans = [], isLoading } = getMealPlansByDate(selectedDate);

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
  const hasMealsByDayIndex = useMemo(
    () => rollingDates.map((d) => weekPlans.some((p) => p.planned_date === formatLocalDate(d))),
    [rollingDates, weekPlans]
  );
  const dayKeys = useMemo(() => rollingDates.map((d) => formatLocalDate(d)), [rollingDates]);
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
      console.log("[ROLLING autofill]", { missingCount: missingDayKeys.length });
    }
  }, [startKey, endKey, missingDayKeys]);

  useEffect(() => {
    if (missingDayKeys.length === 0) {
      if (isPlanDebug() || isPerf()) console.log("[AUTOFILL] nothing to fill");
      return;
    }
    if (
      missingDayKeys.length !== 1 ||
      missingDayKeys[0] !== endKey ||
      !hasAccess ||
      autogenTriggeredRef.current
    )
      return;
    if (isAnyGenerating) {
      if (isPlanDebug() || isPerf()) console.log("[AUTOFILL] blocked by guard");
      return;
    }
    if (isWeekPlansLoading) return;

    const lastRunAt = typeof localStorage !== "undefined" ? localStorage.getItem(AUTOFILL_STORAGE_KEY) : null;
    const lastRun = lastRunAt ? parseInt(lastRunAt, 10) : 0;
    if (Number.isNaN(lastRun) || Date.now() - lastRun < AUTOFILL_COOLDOWN_MS) return;

    autogenTriggeredRef.current = true;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(AUTOFILL_STORAGE_KEY, String(Date.now()));
    }
    startPlanGeneration({
      type: "day",
      member_id: memberIdForPlan,
      member_data: memberDataForPlan,
      day_key: formatLocalDate(rollingDates[6]),
    }).catch(() => {
      autogenTriggeredRef.current = false;
    });
  }, [
    isWeekPlansLoading,
    isAnyGenerating,
    missingDayKeys,
    endKey,
    hasAccess,
    rollingDates,
    startPlanGeneration,
    memberIdForPlan,
    memberDataForPlan,
    planProgressDone,
    planProgressTotal,
    selectedMemberId,
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
        headerCenter={
          <span className="text-typo-title font-semibold text-foreground tracking-tight">
            Mom Recipes <span className="text-primary" aria-hidden>🌿</span>
          </span>
        }
      >
      <div className="flex flex-col min-h-0 flex-1 px-4 relative">
        {/* Content wrapper: один скролл; при переходе на вкладку План скролл сбрасывается вверх */}
        <div ref={scrollContainerRef} className="relative flex-1 min-h-0 overflow-y-auto">
          {/* 1) Today Card: заголовок, дата + селектор профиля, бейдж, действия */}
          <div className="rounded-2xl bg-white border border-slate-200/80 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] p-4 mb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold text-foreground leading-tight">
                  {selectedDayKey === todayKey
                    ? "Сегодня, " + formatDayHeader(selectedDate).split(", ")[0].toLowerCase()
                    : formatDayHeader(selectedDate).split(", ")[0] + ", " + formatShortDate(selectedDate)}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="text-typo-caption text-muted-foreground">
                    {formatShortDate(selectedDate)}
                    {memberDataForPlan?.name && ` · ${memberDataForPlan.name}`}
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
                  ${subscriptionStatus === "premium" ? "bg-emerald-100 text-emerald-800" : subscriptionStatus === "trial" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}
                `}
              >
                {statusBadgeLabel}
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {isCompletelyEmpty && !isAnyGenerating && (
                  <>
                    {isFree ? (
                      <Button
                        size="sm"
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                        onClick={async () => {
                          if (todayIndex < 0) return;
                          setPoolUpgradeLoading(true);
                          try {
                            const result = await runPoolUpgrade({
                              type: "day",
                              member_id: memberIdForPlan,
                              member_data: memberDataForPlan,
                              day_key: todayKey,
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
                        disabled={isAnyGenerating}
                      >
                        <Sparkles className="w-4 h-4 mr-1.5 shrink-0" />
                        {isAnyGenerating ? "Подбираем…" : "Подобрать рецепты"}
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                          onClick={async () => {
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
                              toast({ title: "Подобрать рецепты", description: desc });
                            } catch (e: unknown) {
                              toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "Не удалось подобрать рецепты" });
                            } finally {
                              setPoolUpgradeLoading(false);
                            }
                          }}
                          disabled={isAnyGenerating}
                        >
                          <Sparkles className="w-4 h-4 mr-1.5 shrink-0" />
                          {isAnyGenerating ? "Подбираем…" : "Подобрать рецепты"}
                        </Button>
                        <button
                          type="button"
                          onClick={() => setMutedWeekKeyAndStorage(null)}
                          className="text-typo-caption text-emerald-600 hover:text-emerald-700 transition-colors"
                        >
                          Заполнить шаблоном
                        </button>
                      </>
                    )}
                  </>
                )}
                {hasAnyWeekPlan && !isCompletelyEmpty && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className={`rounded-xl border-slate-200 ${isAnyGenerating ? "opacity-70 cursor-wait" : ""}`}
                      disabled={(isFree && todayIndex < 0) || undefined}
                      onClick={async () => {
                        if (isAnyGenerating) {
                          toast({ description: "Идёт подбор рецептов, подождите…" });
                          return;
                        }
                        setPoolUpgradeLoading(true);
                        try {
                          const result = await runPoolUpgrade({
                            type: isFree ? "day" : "week",
                            member_id: memberIdForPlan,
                            member_data: memberDataForPlan,
                            ...(isFree ? { day_key: todayKey } : { start_key: getRollingStartKey(), day_keys: getRollingDayKeys() }),
                          });
                          setMutedWeekKeyAndStorage(null);
                          queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                          const aiFallback = result.aiFallbackCount ?? 0;
                          const desc = aiFallback > 0
                            ? `Подобрано из базы: ${result.replacedCount}, добавлено AI: ${aiFallback}`
                            : `Подобрано: ${result.replacedCount} из ${result.totalSlots ?? (isFree ? 4 : 28)}`;
                          toast({ title: "Подобрать рецепты", description: desc });
                        } catch (e: unknown) {
                          toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "Не удалось подобрать рецепты" });
                        } finally {
                          setPoolUpgradeLoading(false);
                        }
                      }}
                    >
                      <Sparkles className="w-4 h-4 mr-1.5 shrink-0" />
                      {isAnyGenerating ? "Подбираем…" : "Подобрать рецепты"}
                    </Button>
                    <button
                    type="button"
                    onClick={async () => {
                      if (isAnyGenerating) {
                        toast({ description: "Идёт генерация плана, подождите…" });
                        return;
                      }
                      if (isFree) {
                        if (!window.confirm("Удалить все блюда на сегодня?")) return;
                        setMutedWeekKeyAndStorage(startKey);
                        try {
                          await clearWeekPlan({ startDate: selectedDate, endDate: selectedDate });
                          toast({ title: "План на день очищен", description: "Блюда на сегодня удалены" });
                        } catch (e: any) {
                          toast({ variant: "destructive", title: "Ошибка", description: e?.message || "Не удалось очистить" });
                        }
                      } else {
                        const msg = hasDbWeekPlan
                          ? "Удалить все блюда на ближайшие 7 дней? Это действие нельзя отменить."
                          : "Скрыть шаблонное меню на эти 7 дней?";
                        if (!window.confirm(msg)) return;
                        setMutedWeekKeyAndStorage(startKey);
                        if (hasDbWeekPlan) {
                          try {
                            await clearWeekPlan({ startDate: rollingDates[0], endDate: rollingDates[6] });
                            toast({ title: "План на 7 дней очищен", description: "План питания удалён" });
                          } catch (e: any) {
                            toast({ variant: "destructive", title: "Ошибка", description: e?.message || "Не удалось очистить" });
                          }
                        }
                      }
                    }}
                    className={`text-typo-caption text-muted-foreground/80 hover:text-muted-foreground ${isAnyGenerating ? "opacity-70 cursor-wait" : ""}`}
                    title={isAnyGenerating ? "Идёт генерация плана" : undefined}
                  >
                    {isFree ? "Очистить день" : "Очистить 7 дней"}
                  </button>
                </>
              )}
              </div>
              {(memberDataForPlan?.allergies?.length || memberDataForPlan?.preferences?.length) ? (
                <p className="text-[11px] text-muted-foreground">
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
          </div>

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

          {/* 3) Приёмы пищи: блоки с заголовком и карточкой/плейсхолдером */}
          <div className="mt-4 space-y-4 pb-6">
            {mealTypes.map((slot) => {
              const plannedMeal = mealsByType[slot.id];
              const recipe = plannedMeal ? getPlannedMealRecipe(plannedMeal) : null;
              const recipeId = plannedMeal ? getPlannedMealRecipeId(plannedMeal) : null;
              const hasDish = !!(plannedMeal && recipeId && recipe?.title);
              return (
                <div key={slot.id}>
                  <p className="text-typo-caption font-medium text-foreground mb-1.5">{slot.label}</p>
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
                      isFavorite={previews[recipeId!]?.isFavorite ?? false}
                      onToggleFavorite={isValidRecipeId(recipeId!) ? handleToggleFavorite : undefined}
                      onShare={isValidRecipeId(recipeId!) ? handleShare : undefined}
                      isReplaceLoading={replacingSlotKey === `${selectedDayKey}_${slot.id}`}
                      onReplace={async () => {
                        if (isAnyGenerating) {
                          toast({ description: "Идёт генерация плана…" });
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
                            });
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
                    />
                  ) : isLoading || isAnyGenerating ? (
                    <MealCardSkeleton />
                  ) : (
                    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/60 min-h-[48px] justify-center px-4 py-3">
                      <p className="text-typo-caption text-muted-foreground">Пока нет блюда</p>
                      {(isCompletelyEmpty && !isAnyGenerating) || (hasAnyWeekPlan && !isAnyGenerating) ? (
                        <button
                          type="button"
                          className="text-typo-caption text-emerald-600 hover:text-emerald-700 font-medium w-fit"
                          onClick={async () => {
                            if (isFree && todayIndex >= 0) {
                              setPoolUpgradeLoading(true);
                              try {
                                const result = await runPoolUpgrade({
                                  type: "day",
                                  member_id: memberIdForPlan,
                                  member_data: memberDataForPlan,
                                  day_key: todayKey,
                                });
                                setMutedWeekKeyAndStorage(null);
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
                            } else if (!isFree && isCompletelyEmpty) {
                              setMutedWeekKeyAndStorage(null);
                            } else if (!isFree) {
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
                                toast({ title: "Подобрать рецепты", description: desc });
                              } catch (e: unknown) {
                                toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "Не удалось подобрать рецепты" });
                              } finally {
                                setPoolUpgradeLoading(false);
                              }
                            }
                          }}
                          disabled={isAnyGenerating}
                        >
                          {isCompletelyEmpty && !isFree ? "Заполнить шаблоном" : "Подобрать рецепты"}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

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
                      if (typeof localStorage !== "undefined") {
                        localStorage.setItem(AUTOFILL_STORAGE_KEY, String(Date.now()));
                      }
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

    </MobileLayout>
  );
}
