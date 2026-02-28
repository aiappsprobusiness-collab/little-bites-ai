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
import { useFavorites } from "@/hooks/useFavorites";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { usePlanGenerationJob, getStoredJobId, setStoredJobId } from "@/hooks/usePlanGenerationJob";
import { useReplaceMealSlot } from "@/hooks/useReplaceMealSlot";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation } from "react-router-dom";
import { MealCard, MealCardSkeleton } from "@/components/meal-plan/MealCard";
import { MemberSelectorButton } from "@/components/family/MemberSelectorButton";
import { PoolExhaustedSheet } from "@/components/plan/PoolExhaustedSheet";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppStore } from "@/store/useAppStore";
import { formatLocalDate } from "@/utils/dateUtils";
import { getRolling7Dates, getRollingStartKey, getRollingEndKey, getRollingDayKeys } from "@/utils/dateRange";
import { normalizeTitleKey } from "@/utils/recipePool";
import { Check, Trash2, MoreVertical, Info } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDebugPlanFromStorage, setDebugPlanInStorage } from "@/utils/debugPlan";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";

/** Включить визуальный debug пула и логи replace_slot: window.__PLAN_DEBUG = true или ?debugPool=1 */
function isPlanDebug(): boolean {
  if (typeof window === "undefined") return false;
  return (window as Window & { __PLAN_DEBUG?: boolean }).__PLAN_DEBUG === true || new URLSearchParams(window.location.search).get("debugPool") === "1";
}

/** Включить perf-логи: ?perf=1 */
function isPerf(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("perf") === "1";
}

/**
 * ТЕСТ-ПЛАН (план питания, Fill / Replace):
 * 1) Fill day (Free/Premium): только POOL, без AI. Пустые слоты остаются пустыми. В dev: [FILL] source=POOL only.
 * 2) Fill week (Premium): только POOL. В dev: [FILL] source=POOL only.
 * 3) Replace (↻): Free — paywall; Premium/Trial — pool-first, затем AI. В dev: [REPLACE] source=AI premiumOnly.
 * 4) Edge replace_slot: при Free и пустом пуле возвращает premium_required (без вызова AI).
 */

import { applyReplaceSlotToPlanCache } from "@/utils/planCache";
import { getLimitReachedTitle, getLimitReachedMessage } from "@/utils/limitReachedMessages";
import { trackUsageEvent } from "@/utils/usageEvents";

/** Краткие названия дней: Пн..Вс (индекс 0 = Пн, getDay() 1 = Пн). */
const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
function getDayLabel(date: Date): string {
  return weekDays[(date.getDay() + 6) % 7];
}

/** Фразы статуса генерации плана (цикл по порядку, без рандома). */
const GENERATION_STATUS_PHRASES = [
  "Подбираем лучшие варианты…",
  "Учитываем профиль семьи…",
  "Проверяем ингредиенты…",
  "Формируем сбалансированное меню…",
  "Почти готово…",
];

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
        relative flex flex-col items-center justify-center min-w-[36px] min-h-[32px] py-1 px-2 rounded-md shrink-0 transition-colors border text-[12px]
        ${isLocked
          ? "bg-muted/80 border-border text-muted-foreground cursor-not-allowed"
          : isActive
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
        }
        ${!isActive && isToday && !isLocked ? "ring-1 ring-primary/20" : ""}
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
  const setPaywallReason = useAppStore((s) => s.setPaywallReason);
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
      const allLikes = Array.from(new Set(members.flatMap((c) => (c as { likes?: string[] }).likes ?? []).map((p) => String(p).trim()).filter(Boolean)));
      const allDislikes = Array.from(new Set(members.flatMap((c) => (c as { dislikes?: string[] }).dislikes ?? []).map((p) => String(p).trim()).filter(Boolean)));
      return {
        name: "Семья",
        age_months: youngest.age_months ?? 0,
        type: "family" as const,
        allergies: allAllergies,
        likes: allLikes,
        dislikes: allDislikes,
      };
    }
    const memberForPlan = selectedMember ?? (isFree && selectedMemberId === "family" && members.length > 0 ? members[0] : null);
    if (memberForPlan) {
      const m = memberForPlan as { allergies?: string[]; likes?: string[]; dislikes?: string[]; type?: string };
      return {
        name: memberForPlan.name,
        age_months: memberForPlan.age_months ?? 0,
        type: m.type ?? "child",
        allergies: m.allergies ?? [],
        likes: m.likes ?? [],
        dislikes: m.dislikes ?? [],
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

  const starterProfile = memberDataForPlan ? { allergies: memberDataForPlan.allergies, likes: memberDataForPlan.likes, dislikes: memberDataForPlan.dislikes } : null;
  const { getMealPlans, getMealPlansByDate, getMealPlanRowExists, clearWeekPlan, deleteMealPlan } = useMealPlans(mealPlanMemberId, starterProfile, { mutedWeekKey });

  const memberIdForPlan = mealPlanMemberId ?? null;
  const { isFavorite: isFavoriteForPlan, toggleFavorite: toggleFavoritePlan } = useFavorites("all");
  const planGenType = isFree ? "day" : "week";
  const {
    job: planJob,
    isRunning: isPlanGenerating,
    progressDone: planProgressDone,
    progressTotal: planProgressTotal,
    errorText: planErrorText,
    isPartialTimeBudget: isPlanPartialTimeBudget,
    startGeneration: startPlanGeneration,
    runPoolUpgrade,
    cancelJob: cancelPlanJob,
    refetchJob,
  } = usePlanGenerationJob(memberIdForPlan, planGenType);

  const [poolUpgradeLoading, setPoolUpgradeLoading] = useState(false);
  const isAnyGenerating = isPlanGenerating || poolUpgradeLoading || isPlanPartialTimeBudget;

  const [statusPhraseIndex, setStatusPhraseIndex] = useState(0);
  useEffect(() => {
    if (!isAnyGenerating) return;
    setStatusPhraseIndex(0);
    const id = setInterval(() => {
      setStatusPhraseIndex((i) => (i + 1) % GENERATION_STATUS_PHRASES.length);
    }, 5000);
    return () => clearInterval(id);
  }, [isAnyGenerating]);

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
  const [poolExhaustedContext, setPoolExhaustedContext] = useState<{ dayKey: string; mealType: string } | null>(null);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState<"day" | "week" | null>(null);
  /** Session-level excludes per day for replace_slot: после каждой замены добавляем recipe_id и titleKey, чтобы не крутить одни и те же рецепты. */
  const [sessionExcludeRecipeIds, setSessionExcludeRecipeIds] = useState<Record<string, string[]>>({});
  const [sessionExcludeTitleKeys, setSessionExcludeTitleKeys] = useState<Record<string, string[]>>({});
  /** Локальная коррекция week-индикаторов до завершения refetch после очистки дня/недели. dayKey -> true = считать день пустым. */
  const [pendingClears, setPendingClears] = useState<Record<string, true>>({});
  /** Один раз за сессию: glow у CTA "Подобрать рецепты" при первом заходе на вкладку */
  const ctaGlowShownRef = useRef(false);
  const [ctaGlow, setCtaGlow] = useState(false);
  const [debugPlanEnabled, setDebugPlanEnabled] = useState(() => getDebugPlanFromStorage());

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
    if (planJob.status === "done" && planJob.error_text === "partial:time_budget") {
      /* Не помечаем как показанный — после автопродолжения покажем тост "План готов". */
    } else {
      planJobNotifiedRef.current = planJob.id;
    }
    if (planJob.status === "done" && wasRunning) {
      if (planJob.error_text === "partial:time_budget") {
        /* Автопродолжение по nextCursor — тост не показываем, в UI уже "Догенерируем план…". */
      } else if (planJob.error_text?.includes("взрослого профиля")) {
        toast({ description: planJob.error_text });
      } else if (planJob.error_text?.startsWith("partial:")) {
        const filled = (planJob.progress_done ?? 0) * 4;
        const total = (planJob.progress_total ?? (planGenType === "week" ? 7 : 1)) * 4;
        toast({ description: `Заполнено ${filled} из ${total}. В пуле не хватило подходящих рецептов. Добавьте рецепты через Чат или Избранное.` });
      } else {
        toast({ description: planGenType === "week" ? "План на 7 дней готов" : "План на день готов" });
      }
    } else if (planJob.status === "error" && wasRunning) {
      if (planErrorText === "LIMIT_REACHED") {
        /* Paywall уже показан при 429 в usePlanGenerationJob, тост не показываем */
        return;
      }
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
      (p.likes ?? []).map((s) => String(s).trim().toLowerCase()).join("|"),
      (p.dislikes ?? []).map((s) => String(s).trim().toLowerCase()).join("|"),
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

  const { data: dayMealPlans = [], isLoading, isFetching } = getMealPlansByDate(selectedDate);
  const { data: rowExistsData } = getMealPlanRowExists(selectedDate);
  /** Единый источник: dayMealPlans (развёрнутые слоты из одной строки). Пустой день только когда загрузка завершена и слотов с recipe_id нет. При refetch после fill не показываем empty. */
  const hasNoDishes = dayMealPlans.filter((p) => p.recipe_id).length === 0;
  const isEmptyDay = !isLoading && !isFetching && hasNoDishes;
  /** Последняя генерация завершилась с сообщением «нет рецептов для взрослого» — показываем отдельный empty state. */
  const isAdultNoRecipesEmpty =
    isEmptyDay && !!planJob?.status && planJob.status === "done" && (planJob.error_text ?? "").includes("взрослого профиля");

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

  /** Мемоизированные exclude для replace_slot (неделя + последние дни). Нормализованные titleKey для консистентности с Edge. */
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
    () => [...new Set(weekPlans.map((p) => normalizeTitleKey((p.recipe?.title ?? "") || "")).filter(Boolean))],
    [weekPlans]
  );
  /** Итоговые exclude для replace_slot: неделя + session по выбранному дню. */
  const replaceExcludeRecipeIdsMerged = useMemo(
    () => [...new Set([...replaceExcludeRecipeIds, ...(sessionExcludeRecipeIds[selectedDayKey] ?? [])])],
    [replaceExcludeRecipeIds, sessionExcludeRecipeIds, selectedDayKey]
  );
  const replaceExcludeTitleKeysMerged = useMemo(
    () => [...new Set([...replaceExcludeTitleKeys, ...(sessionExcludeTitleKeys[selectedDayKey] ?? [])])],
    [replaceExcludeTitleKeys, sessionExcludeTitleKeys, selectedDayKey]
  );

  const hasDbWeekPlan = weekPlans.some((p) => !p.isStarter);
  const hasAnyWeekPlan = weekPlans.length > 0;
  /** Диапазон полностью пустой: нет записей в meal_plans_v2. */
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

  /** Один раз при первом заходе: если план ещё не инициализирован и на сегодня нет meal_plan из БД — заполнить день из пула (POOL only, без AI). */
  useEffect(() => {
    if (location.pathname !== "/meal-plan" || !user?.id || planInitialized || initialPlanRanRef.current) return;
    if (isAnyGenerating || isWeekPlansLoading) return;
    const hasDbPlanForToday = weekPlans.some((p) => p.planned_date === todayKey && !p.isStarter);
    if (hasDbPlanForToday) return;
    initialPlanRanRef.current = true;
    runPoolUpgrade({
      type: "day",
      member_id: memberIdForPlan,
      member_data: memberDataForPlan,
      day_key: todayKey,
      day_keys: getRollingDayKeys(),
    })
      .then(() => {
        setPlanInitialized();
        queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "meal_plans_v2" });
      })
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
    runPoolUpgrade,
    setPlanInitialized,
    queryClient,
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

  const showNoProfile = members.length === 0 && !isMembersLoading;
  const showEmptyFamily = isFamilyMode && members.length === 0 && !isMembersLoading;

  const planViewDayTrackedRef = useRef(false);
  useEffect(() => {
    if (location.pathname !== "/meal-plan" || showNoProfile || showEmptyFamily || planViewDayTrackedRef.current) return;
    planViewDayTrackedRef.current = true;
    trackUsageEvent("plan_view_day");
  }, [location.pathname, showNoProfile, showEmptyFamily]);

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

  if ((isPlanDebug() || isPerf()) && (typeof window !== "undefined")) {
    console.log("[PLAN state]", {
      selectedDayKey,
      selectedMemberId,
      mealPlanMemberId,
    });
  }

  if (isMembersLoading) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  if (showNoProfile || showEmptyFamily) {
    return (
      <MobileLayout>
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
    <MobileLayout>
      <div className="flex flex-col min-h-0 flex-1 px-4 relative overflow-x-hidden touch-pan-y overscroll-x-none max-w-full">
        {/* Content wrapper: один скролл + subtle pattern; горизонтальный скролл/overscroll отключены */}
        <div ref={scrollContainerRef} className="plan-page-bg relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden touch-pan-y overscroll-x-none">
          {/* 1) Hero: компактный, один primary CTA, второстепенные в меню/ниже */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="rounded-2xl bg-primary-light/50 border border-primary-border/80 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.04)] p-3 sm:p-4 mb-1.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-foreground leading-tight tracking-tight">
                  {selectedDayKey === todayKey
                    ? "Сегодня, " + formatDayHeader(selectedDate).split(", ")[0].toLowerCase()
                    : formatDayHeader(selectedDate).split(", ")[0] + ", " + formatShortDate(selectedDate)}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span className="text-sm text-muted-foreground">{formatShortDate(selectedDate)}</span>
                  {members.length > 0 && (
                    <>
                      <span className="text-muted-foreground/70">•</span>
                      <MemberSelectorButton className="shrink-0" />
                    </>
                  )}
                  {planDebug && (dayDbCount > 0 || dayAiCount > 0) && (
                    <span className="text-xs text-slate-500">DB: {dayDbCount} | AI: {dayAiCount}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span
                  className={`
                    text-[11px] font-medium px-2 py-0.5 rounded-md
                    ${subscriptionStatus === "premium" ? "bg-primary-pill text-primary" : subscriptionStatus === "trial" ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}
                  `}
                >
                  {statusBadgeLabel}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors disabled:opacity-60"
                      disabled={isAnyGenerating}
                      aria-label="Ещё действия"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={() => setClearConfirm("day")}
                      disabled={isAnyGenerating}
                      className="text-muted-foreground"
                    >
                      <Trash2 className="w-4 h-4 mr-2 shrink-0" />
                      Очистить день
                    </DropdownMenuItem>
                    {hasAccess && (
                      <DropdownMenuItem
                        onClick={() => setClearConfirm("week")}
                        disabled={isAnyGenerating}
                        className="text-muted-foreground"
                      >
                        <Trash2 className="w-4 h-4 mr-2 shrink-0" />
                        Очистить неделю
                      </DropdownMenuItem>
                    )}
                    {import.meta.env.DEV && (
                      <DropdownMenuCheckboxItem
                        checked={debugPlanEnabled}
                        onCheckedChange={(checked) => {
                          const on = checked === true;
                          setDebugPlanInStorage(on);
                          setDebugPlanEnabled(on);
                        }}
                      >
                        Debug план (консоль: payload/response generate-plan)
                      </DropdownMenuCheckboxItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="mt-2">
              <Button
                size="sm"
                className={`w-full sm:w-auto rounded-xl bg-primary hover:opacity-90 text-white border-0 transition-shadow duration-300 ${ctaGlow ? "shadow-[0_0_0_3px_rgba(110,127,59,0.2)]" : "shadow-sm"}`}
                disabled={isAnyGenerating || (isFree && todayIndex < 0)}
                onClick={async () => {
                  if (isAnyGenerating) return;
                  trackUsageEvent("plan_fill_day_click");
                  if (import.meta.env.DEV) console.info("[FILL] source=POOL only", { type: "day", day_key: selectedDayKey });
                  setPoolUpgradeLoading(true);
                  try {
                    const result = await runPoolUpgrade({
                      type: "day",
                      member_id: memberIdForPlan,
                      member_data: memberDataForPlan,
                      day_key: selectedDayKey,
                      day_keys: dayKeys,
                    });
                    trackUsageEvent("plan_fill_day_success");
                    await queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                    const filled = result.filledSlotsCount ?? result.replacedCount ?? 0;
                    const total = result.totalSlots ?? 4;
                    if (result.partial || (result.ok !== false && (result.emptySlotsCount ?? 0) > 0)) {
                      toast({ title: "Заполнить день", description: `Заполнено ${filled} из ${total}. В пуле не хватило подходящих рецептов. Добавьте рецепты через Чат или Избранное.` });
                    } else {
                      toast({ title: "Заполнить день", description: `Подобрано: ${filled} из ${total}` });
                    }
                  } catch (e: unknown) {
                    trackUsageEvent("plan_fill_day_error", { properties: { message: e instanceof Error ? e.message : String(e) } });
                    const msg = e instanceof Error ? e.message : "Не удалось заполнить день";
                    if (msg === "LIMIT_REACHED") {
                      /* Paywall уже показан в usePlanGenerationJob, тост не показываем */
                    } else if (msg === "member_id_required") {
                      toast({ description: "Выберите профиль ребёнка вверху" });
                    } else if (msg.includes("слишком много времени")) {
                      toast({ description: "Заполнено частично. В пуле не хватило подходящих рецептов. Добавьте рецепты через Чат или Избранное." });
                    } else {
                      toast({ variant: "destructive", title: "Ошибка", description: msg });
                    }
                  } finally {
                    setPoolUpgradeLoading(false);
                  }
                }}
              >
                <Sparkles className="w-4 h-4 mr-1.5 shrink-0" />
                {isAnyGenerating ? "Подбираем…" : isEmptyDay ? "Заполнить день" : "Обновить меню на день"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1.5" aria-live="polite">
                {heroStatusText}
                {isEmptyDay && selectedDayKey === todayKey && " · Экономит до 30 мин"}
              </p>
              {(memberDataForPlan?.allergies?.length || memberDataForPlan?.likes?.length || memberDataForPlan?.dislikes?.length) ? (
                <button
                  type="button"
                  onClick={() => setProfileSheetOpen(true)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>Профиль учитывается</span>
                  <Info className="w-3.5 h-3.5 shrink-0" />
                </button>
              ) : null}
            </div>
          </motion.div>

          {/* Заполнить неделю: Free — кнопка с подписью (доступно с Premium), по клику пейвол; Premium/Триал — без (Premium), по клику генерация */}
          <div className="mb-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl border-primary-border/70 text-muted-foreground hover:text-foreground h-8 text-xs"
              disabled={isFree ? false : isAnyGenerating}
              onClick={async () => {
                if (isFree) {
                  setPaywallCustomMessage("Заполнение недели доступно в Premium. Попробуйте Trial или оформите подписку.");
                  setShowPaywall(true);
                  return;
                }
                if (isAnyGenerating) {
                  toast({ description: "Идёт подбор рецептов, подождите…" });
                  return;
                }
                if (import.meta.env.DEV) console.info("[FILL] source=POOL only", { type: "week" });
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
                  await queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                  const filled = result.filledSlotsCount ?? result.replacedCount ?? 0;
                  const total = result.totalSlots ?? 28;
                  if (result.partial || (result.ok !== false && (result.emptySlotsCount ?? 0) > 0)) {
                    toast({ title: "Заполнить всю неделю", description: `Заполнено ${filled} из ${total}. В пуле не хватило подходящих рецептов. Добавьте рецепты через Чат или Избранное.` });
                  } else {
                    toast({ title: "Заполнить всю неделю", description: `Подобрано: ${filled} из ${total}` });
                  }
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : "Не удалось заполнить неделю";
                  if (msg === "LIMIT_REACHED") {
                    /* Paywall уже показан в usePlanGenerationJob, тост не показываем */
                  } else if (msg === "member_id_required") {
                    toast({ description: "Выберите профиль ребёнка вверху" });
                  } else if (msg.includes("слишком много времени")) {
                    toast({ description: "Заполнено частично. В пуле не хватило подходящих рецептов. Добавьте рецепты через Чат или Избранное." });
                  } else {
                    toast({ variant: "destructive", title: "Ошибка", description: msg });
                  }
                } finally {
                  setPoolUpgradeLoading(false);
                }
              }}
            >
              {isFree ? "Заполнить неделю (доступно с Premium)" : "Заполнить неделю"}
            </Button>
          </div>

          {/* 2) Чипсы дней — горизонтальный скролл только внутри этого блока, страница по X не двигается */}
          <div className="flex gap-1 overflow-x-auto overflow-y-hidden pb-2 -mx-4 px-4 scrollbar-none min-w-0 max-w-full" style={{ scrollbarWidth: "none" }}>
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
              <div
                className="inline-flex items-center rounded-full py-2 px-3.5 text-typo-caption font-medium transition-colors"
                style={{
                  backgroundColor: "hsl(var(--primary) / 0.08)",
                  color: "hsl(var(--primary))",
                }}
                aria-live="polite"
              >
                <motion.span
                  key={statusPhraseIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {GENERATION_STATUS_PHRASES[statusPhraseIndex]}
                </motion.span>
              </div>
              {isPlanGenerating && (
                <button
                  type="button"
                  onClick={() => cancelPlanJob()}
                  className="text-typo-caption text-primary hover:text-primary/80 underline"
                >
                  Отменить
                </button>
              )}
            </div>
          )}

          {/* 3) Приёмы пищи: loader при загрузке/refetch, иначе empty state или слоты (единый источник: dayMealPlans) */}
          {isLoading || isFetching ? (
            <div className="mt-3 space-y-4 pb-4">
              {mealTypes.map((slot) => (
                <div key={slot.id}>
                  <p className="text-sm font-medium text-foreground mb-2">{slot.label}</p>
                  <MealCardSkeleton />
                </div>
              ))}
            </div>
          ) : isEmptyDay ? (
            <div className="mt-2 rounded-2xl border border-primary-border/60 bg-primary-light/30 p-4 text-center">
              <p className="text-4xl mb-1.5" aria-hidden>{isAdultNoRecipesEmpty ? "📋" : "✨"}</p>
              <h3 className="text-plan-hero-title font-semibold text-foreground mb-1">
                {isAdultNoRecipesEmpty ? "Недостаточно рецептов в пуле для этого профиля" : "План на день пока пуст"}
              </h3>
              <p className="text-plan-secondary text-muted-foreground text-sm mb-3">
                {isAdultNoRecipesEmpty
                  ? "Добавьте рецепты для взрослых через Чат (например: «Подбери обед на понедельник») или Избранное."
                  : "Нажми «Заполнить день» или подбери рецепт для нужного приёма пищи."}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {isAdultNoRecipesEmpty ? (
                  <Button
                    size="sm"
                    className="rounded-2xl bg-primary hover:opacity-90 text-white border-0 shadow-soft"
                    onClick={() => navigate("/chat")}
                  >
                    <Plus className="w-4 h-4 mr-1.5 shrink-0" />
                    Сгенерировать в чате
                  </Button>
                ) : (
                <Button
                  size="sm"
                  className="rounded-2xl bg-primary hover:opacity-90 text-white border-0 shadow-soft"
                  disabled={isAnyGenerating || (isFree && todayIndex < 0)}
                  onClick={async () => {
                    if (isAnyGenerating) return;
                    trackUsageEvent("plan_fill_day_click");
                    if (import.meta.env.DEV) console.info("[FILL] source=POOL only", { type: "day", day_key: selectedDayKey });
                    setPoolUpgradeLoading(true);
                    try {
                      const result = await runPoolUpgrade({ type: "day", member_id: memberIdForPlan, member_data: memberDataForPlan, day_key: selectedDayKey, day_keys: dayKeys });
                      trackUsageEvent("plan_fill_day_success");
                      await queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                      const filled = result.filledSlotsCount ?? result.replacedCount ?? 0;
                      const total = result.totalSlots ?? 4;
                      if (result.partial || (result.ok !== false && (result.emptySlotsCount ?? 0) > 0)) {
                        toast({ title: "Заполнить день", description: `Заполнено ${filled} из ${total}. В пуле не хватило подходящих рецептов. Добавьте рецепты через Чат или Избранное.` });
                      } else {
                        toast({ title: "Заполнить день", description: `Подобрано: ${filled} из ${total}` });
                      }
                    } catch (e: unknown) {
                      trackUsageEvent("plan_fill_day_error", { properties: { message: e instanceof Error ? e.message : String(e) } });
                      const msg = e instanceof Error ? e.message : "Не удалось заполнить день";
                      if (msg === "LIMIT_REACHED") {
                        /* Paywall уже показан в usePlanGenerationJob, тост не показываем */
                      } else if (msg.includes("слишком много времени")) {
                        toast({ description: "Заполнено частично. В пуле не хватило подходящих рецептов. Добавьте рецепты через Чат или Избранное." });
                      } else {
                        toast({ variant: "destructive", title: "Ошибка", description: msg });
                      }
                    } finally {
                      setPoolUpgradeLoading(false);
                    }
                  }}
                >
                  <Sparkles className="w-4 h-4 mr-1.5 shrink-0" />
                  Заполнить день
                </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-2xl border-primary-border"
                  onClick={() => navigate("/chat")}
                >
                  <Plus className="w-4 h-4 mr-1.5 shrink-0" />
                  {isAdultNoRecipesEmpty ? "Сгенерировать в чате" : "Подобрать рецепт"}
                </Button>
              </div>
            </div>
          ) : (
          <div className="mt-3 space-y-4 pb-4">
            {mealTypes.map((slot) => {
              const plannedMeal = mealsByType[slot.id];
              const recipe = plannedMeal ? getPlannedMealRecipe(plannedMeal) : null;
              const recipeId = plannedMeal ? getPlannedMealRecipeId(plannedMeal) : null;
              const hasDish = !!(plannedMeal && recipeId && recipe?.title);
              return (
                <div key={slot.id}>
                  <p className="text-sm font-medium text-foreground mb-2">{slot.label}</p>
                  {hasDish ? (
                    <MealCard
                      mealType={plannedMeal!.meal_type}
                      recipeTitle={recipe!.title}
                      recipeId={recipeId!}
                      mealTypeLabel={slot.label}
                      plannedDate={selectedDayKey}
                      planMemberId={mealPlanMemberId ?? null}
                      compact
                      isLoadingPreviews={isLoadingPreviews}
                      cookTimeMinutes={previews[recipeId!]?.cookTimeMinutes}
                      ingredientNames={previews[recipeId!]?.ingredientNames}
                      ingredientTotalCount={previews[recipeId!]?.ingredientTotalCount}
                      calories={previews[recipeId!]?.calories}
                      proteins={previews[recipeId!]?.proteins}
                      fats={previews[recipeId!]?.fats}
                      carbs={previews[recipeId!]?.carbs}
                      isFavorite={isFavoriteForPlan(recipeId!, memberIdForPlan)}
                      onToggleFavorite={async (rid, next) => {
                        const p = previews[rid];
                        await toggleFavoritePlan({
                          recipeId: rid,
                          memberId: memberIdForPlan,
                          isFavorite: next,
                          recipeData: next ? { title: recipe!.title, cookTimeMinutes: p?.cookTimeMinutes ?? null, ingredientNames: p?.ingredientNames, chefAdvice: p?.chefAdvice ?? null, advice: p?.advice ?? null } : undefined,
                        });
                      }}
                      hint={
                        (() => {
                          const p = previews[recipeId!];
                          if (!p) return undefined;
                          const tip = (hasAccess && p.chefAdvice?.trim()) ? p.chefAdvice : (p.advice?.trim() ?? p.chefAdvice?.trim());
                          return tip ?? undefined;
                        })()
                      }
                      isReplaceLoading={replacingSlotKey === `${selectedDayKey}_${slot.id}`}
                      replaceShowsLock={isFree}
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
                        if (import.meta.env.DEV) console.info("[REPLACE] source=AI premiumOnly", { dayKey: selectedDayKey, slot: slot.id });
                        const slotKey = `${selectedDayKey}_${slot.id}`;
                        if (replacingSlotKey != null) return;
                        setReplacingSlotKey(slotKey);
                        try {
                          const result = await replaceMealSlotAuto({
                            dayKey: selectedDayKey,
                            mealType: slot.id,
                            excludeRecipeIds: replaceExcludeRecipeIdsMerged,
                            excludeTitleKeys: replaceExcludeTitleKeysMerged,
                            memberData: memberDataForPlan
                              ? {
                                allergies: memberDataForPlan.allergies,
                                likes: memberDataForPlan.likes,
                                dislikes: memberDataForPlan.dislikes,
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
                            setSessionExcludeRecipeIds((prev) => ({
                              ...prev,
                              [selectedDayKey]: [...(prev[selectedDayKey] ?? []), result.newRecipeId],
                            }));
                            setSessionExcludeTitleKeys((prev) => ({
                              ...prev,
                              [selectedDayKey]: [...(prev[selectedDayKey] ?? []), normalizeTitleKey(result.title)],
                            }));
                            applyReplaceSlotToPlanCache(queryClient, { mealPlansKeyWeek, mealPlansKeyDay }, {
                              dayKey: selectedDayKey,
                              mealType: slot.id,
                              newRecipeId: result.newRecipeId,
                              title: result.title,
                              plan_source: result.plan_source,
                            }, mealPlanMemberId ?? null);
                            await queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                            toast({
                              description: result.pickedSource === "ai" ? "Подбираем новый вариант…" : "Блюдо заменено",
                            });
                            if (isPlanDebug()) {
                              console.info("[replace_slot]", { requestId: result.requestId, dayKey: selectedDayKey, memberId: mealPlanMemberId, slot: slot.id, ok: true, reason: result.reason });
                            }
                          } else {
                            const code = (result as { code?: string }).code;
                            if (code === "LIMIT_REACHED") {
                              setPaywallCustomMessage(
                                `${getLimitReachedTitle()}\n\n${getLimitReachedMessage("plan_refresh")}`
                              );
                              setShowPaywall(true);
                            } else if (code === "pool_exhausted") {
                              setPoolExhaustedContext({ dayKey: selectedDayKey, mealType: slot.id });
                            } else {
                              const err = "error" in result ? result.error : "";
                              if (err === "limit") {
                                toast({
                                  variant: "destructive",
                                  title: "Лимит",
                                  description: "1 замена в день (Free). В Premium — без ограничений.",
                                });
                              } else if (err === "premium_required") {
                                setPaywallCustomMessage("Замена блюда с подбором рецепта доступна в Premium.");
                                setShowPaywall(true);
                              } else {
                                toast({
                                  variant: "destructive",
                                  title: "Не удалось заменить",
                                  description: err === "unauthorized" ? "Нужна авторизация" : err,
                                });
                              }
                            }
                            if (isPlanDebug()) {
                              console.info("[replace_slot]", { requestId: result.requestId, dayKey: selectedDayKey, memberId: mealPlanMemberId, slot: slot.id, ok: false, reason: result.reason, error: "error" in result ? result.error : undefined });
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
                            if (import.meta.env.DEV) console.info("[REPLACE] source=AI premiumOnly", { dayKey: selectedDayKey, slot: slot.id });
                            const slotKey = `${selectedDayKey}_${slot.id}`;
                            setReplacingSlotKey(slotKey);
                            try {
                              const result = await replaceMealSlotAuto({
                                dayKey: selectedDayKey,
                                mealType: slot.id,
                                excludeRecipeIds: replaceExcludeRecipeIdsMerged,
                                excludeTitleKeys: replaceExcludeTitleKeysMerged,
                                memberData: memberDataForPlan
                                  ? {
                                    allergies: memberDataForPlan.allergies,
                                    likes: memberDataForPlan.likes,
                                    dislikes: memberDataForPlan.dislikes,
                                    age_months: memberDataForPlan.age_months,
                                  }
                                  : undefined,
                                isFree,
                              });
                              if (result.ok) {
                                setSessionExcludeRecipeIds((prev) => ({
                                  ...prev,
                                  [selectedDayKey]: [...(prev[selectedDayKey] ?? []), result.newRecipeId],
                                }));
                                setSessionExcludeTitleKeys((prev) => ({
                                  ...prev,
                                  [selectedDayKey]: [...(prev[selectedDayKey] ?? []), normalizeTitleKey(result.title)],
                                }));
                                applyReplaceSlotToPlanCache(queryClient, { mealPlansKeyWeek, mealPlansKeyDay }, {
                                  dayKey: selectedDayKey,
                                  mealType: slot.id,
                                  newRecipeId: result.newRecipeId,
                                  title: result.title,
                                  plan_source: result.plan_source,
                                }, mealPlanMemberId ?? null);
                                await queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                                toast({
                                  description: result.pickedSource === "ai" ? "Рецепт подобран (AI)" : "Рецепт подобран из базы",
                                });
                                if (isPlanDebug()) {
                                  console.info("[replace_slot]", { requestId: result.requestId, dayKey: selectedDayKey, memberId: mealPlanMemberId, slot: slot.id, ok: true, reason: result.reason });
                                }
                              } else {
                                const code = (result as { code?: string }).code;
                                if (code === "LIMIT_REACHED") {
                                  setPaywallCustomMessage(
                                    `${getLimitReachedTitle()}\n\n${getLimitReachedMessage("plan_refresh")}`
                                  );
                                  setShowPaywall(true);
                                } else if (code === "pool_exhausted") {
                                  setPoolExhaustedContext({ dayKey: selectedDayKey, mealType: slot.id });
                                } else {
                                  const err = "error" in result ? result.error : "";
                                  if (err === "limit") {
                                    toast({
                                      variant: "destructive",
                                      title: "Лимит",
                                      description: "1 замена в день (Free). В Premium — без ограничений.",
                                    });
                                  } else if (err === "premium_required") {
                                    setPaywallCustomMessage("Замена блюда с подбором рецепта доступна в Premium.");
                                    setShowPaywall(true);
                                  } else {
                                    toast({
                                      variant: "destructive",
                                      title: "Не удалось подобрать",
                                      description: err === "unauthorized" ? "Нужна авторизация" : err,
                                    });
                                  }
                                }
                                if (isPlanDebug()) {
                                  console.info("[replace_slot]", { requestId: result.requestId, dayKey: selectedDayKey, memberId: mealPlanMemberId, slot: slot.id, ok: false, reason: result.reason, error: "error" in result ? result.error : undefined });
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
                        day_keys: dayKeys,
                      });
                      queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                      const filled = result.filledSlotsCount ?? result.replacedCount ?? 0;
                      const total = result.totalSlots ?? 4;
                      if (result.partial || (result.ok !== false && (result.emptySlotsCount ?? 0) > 0)) {
                        toast({ title: "Подобрать рецепты", description: `Заполнено ${filled} из ${total}. В пуле не хватило подходящих рецептов. Добавьте рецепты через Чат или Избранное.` });
                      } else {
                        const aiFallback = result.aiFallbackCount ?? 0;
                        const desc = aiFallback > 0
                          ? `Подобрано из базы: ${result.replacedCount ?? 0}, добавлено AI: ${aiFallback}`
                          : `Подобрано: ${filled} из ${total}`;
                        toast({ title: "Подобрать рецепты", description: desc });
                      }
                  } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : "Не удалось подобрать рецепты";
                    if (msg === "LIMIT_REACHED") {
                      /* Paywall уже показан в usePlanGenerationJob, тост не показываем */
                    } else if (msg === "member_id_required") {
                      toast({ description: "Выберите профиль ребёнка вверху" });
                    } else if (msg.includes("слишком много времени")) {
                      toast({ description: "Заполнено частично. В пуле не хватило подходящих рецептов. Добавьте рецепты через Чат или Избранное." });
                    } else {
                      toast({ variant: "destructive", title: "Ошибка", description: msg });
                    }
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

      <PoolExhaustedSheet
        open={!!poolExhaustedContext}
        onOpenChange={(open) => !open && setPoolExhaustedContext(null)}
        selectedDayKey={poolExhaustedContext?.dayKey ?? ""}
        mealType={poolExhaustedContext?.mealType ?? ""}
        memberId={mealPlanMemberId ?? null}
        memberName={memberDataForPlan?.name}
        allergies={memberDataForPlan?.allergies}
        likes={memberDataForPlan?.likes}
        dislikes={memberDataForPlan?.dislikes}
        mealPlansKeyWeek={mealPlansKeyWeek}
        mealPlansKeyDay={mealPlansKeyDay}
        queryClient={queryClient}
      />

      <Sheet open={profileSheetOpen} onOpenChange={setProfileSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left pb-3">
            <SheetTitle>Профиль учитывается</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 pb-6 text-sm">
            {memberDataForPlan?.allergies?.length ? (
              <div>
                <p className="font-medium text-muted-foreground mb-1">Аллергии</p>
                <p className="text-foreground">{memberDataForPlan.allergies.join(", ")}</p>
              </div>
            ) : null}
            {memberDataForPlan?.likes?.length ? (
              <div>
                <p className="font-medium text-muted-foreground mb-1">Любит</p>
                <p className="text-foreground">{memberDataForPlan.likes.join(", ")}</p>
              </div>
            ) : null}
            {memberDataForPlan?.dislikes?.length ? (
              <div>
                <p className="font-medium text-muted-foreground mb-1">Не любит</p>
                <p className="text-foreground">{memberDataForPlan.dislikes.join(", ")}</p>
              </div>
            ) : null}
            {(!memberDataForPlan?.allergies?.length && !memberDataForPlan?.likes?.length && !memberDataForPlan?.dislikes?.length) ? (
              <p className="text-muted-foreground">Нет указанных аллергий и предпочтений.</p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmActionModal
        open={clearConfirm !== null}
        onOpenChange={(open) => !open && setClearConfirm(null)}
        title={clearConfirm === "week" ? "Очистить неделю?" : "Очистить день?"}
        description={
          clearConfirm === "week"
            ? "Все блюда на неделю будут удалены из плана. Это действие нельзя отменить."
            : "Все блюда за выбранный день будут удалены из плана. Это действие нельзя отменить."
        }
        confirmText="Очистить"
        cancelText="Отмена"
        onConfirm={async () => {
          const which = clearConfirm;
          if (!which || isAnyGenerating) return;
          if (which === "week" && !hasAccess) {
            toast({ title: "Доступно в Premium", description: "Очистка недели доступна по подписке." });
            setClearConfirm(null);
            return;
          }
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
            await queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
            toast({ title: isDay ? "День очищен" : "Неделя очищена", description: "Блюда удалены" });
          } catch (e: unknown) {
            toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "Не удалось очистить" });
          } finally {
            setPendingClears({});
          }
        }}
      />
    </MobileLayout>
  );
}
