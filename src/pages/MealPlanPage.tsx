import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { SubscriptionTierBadge } from "@/components/layout/SubscriptionTierBadge";
import { TabOverflowIconButton } from "@/components/layout/TabOverflowIconButton";
import { TabProfileMenuRow } from "@/components/layout/TabProfileMenuRow";
import { TabEmptyState } from "@/components/ui/TabEmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calendar as CalendarIcon,
  CalendarDays,
  Check,
  ClipboardList,
  ChevronRight,
  HeartHandshake,
  Info,
  Loader2,
  Plus,
  ShoppingCart,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMealPlans, mealPlansKey } from "@/hooks/useMealPlans";
import { useMealPlanMemberData, MEAL_PLAN_MUTED_WEEK_STORAGE_KEY } from "@/hooks/useMealPlanMemberData";
import { useRecipePreviewsByIds } from "@/hooks/useRecipePreviewsByIds";
import { useRecipes } from "@/hooks/useRecipes";
import { useFavorites } from "@/hooks/useFavorites";
import { useAuth } from "@/hooks/useAuth";
import { useMembers } from "@/hooks/useMembers";
import { useFamily } from "@/contexts/FamilyContext";
import { logEmptyOnboardingReason } from "@/utils/authSessionDebug";
import { usePlanGenerationJob, getStoredJobId, setStoredJobId } from "@/hooks/usePlanGenerationJob";
import { useReplaceMealSlot } from "@/hooks/useReplaceMealSlot";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useNavigate, useLocation, useSearchParams, Link } from "react-router-dom";
import { MealCard, MealCardSkeleton } from "@/components/meal-plan/MealCard";
import { MemberSelectorButton } from "@/components/family/MemberSelectorButton";
import { PlanProfileHelpBody } from "@/components/plan/PlanModeHint";
import { PlanGoalCompactSheet } from "@/components/plan/PlanGoalChipsRow";
import { isFamilySelected } from "@/utils/planModeUtils";
import { selectGoalForEdge } from "@/utils/planGoalSelect";
import { getPlanSlotChatPrefillMessage } from "@/utils/planChatPrefill";
import { PoolExhaustedSheet } from "@/components/plan/PoolExhaustedSheet";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppStore } from "@/store/useAppStore";
import { addDaysToLocalYmd, formatLocalDate } from "@/utils/dateUtils";
import type { MembersRow } from "@/integrations/supabase/types-v2";
import { getRolling7Dates, getRollingStartKey, getRollingEndKey, getRollingDayKeys } from "@/utils/dateRange";
import {
  normalizeTitleKey,
  listInfantNewRecipeCandidates,
  listInfantFamiliarRecipeCandidates,
  pickInfantNewRecipe,
  pickInfantFamiliarRecipe,
  type MemberDataForPool,
  type MealType,
} from "@/utils/recipePool";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getDebugPlanFromStorage, setDebugPlanInStorage } from "@/utils/debugPlan";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { ShareIosIcon } from "@/components/icons/ShareIosIcon";
import { cn } from "@/lib/utils";
import { recipeCard, recipeMealBadge } from "@/theme/recipeTokens";

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
 * 5) Занятый слот: ограничение pool-автозамены по slot/day; после лимита или pool_exhausted — fallback через PoolExhaustedSheet.
 */

import { applyReplaceSlotToPlanCache, applyClearSlotToPlanCache } from "@/utils/planCache";
import { getLimitReachedTitle, getLimitReachedMessage } from "@/utils/limitReachedMessages";
import { trackUsageEvent } from "@/utils/usageEvents";
import { consumeJustCreatedMemberId } from "@/services/planFill";
import {
  getInfantComplementaryAgeBandU12,
  INFANT_PLAN_SLOT_FAMILIAR,
  INFANT_PLAN_SLOT_NEW_PRODUCT,
  isInfantComplementaryPlanContext,
  isInfantNewRecipePlanSlot,
} from "@/utils/infantComplementaryPlan";
import {
  getAutoReplaceLimitPerSlotPerDay,
  getSlotDayKey,
  isInfantAutoreplaceContext,
  type InfantPoolExhaustedReason,
} from "@/utils/infantAutoreplace";
import { FF_WEEK_PAYWALL_PREVIEW } from "@/config/featureFlags";
import { WeekPreviewPaywallSheet, type PreviewMeal } from "@/components/plan/WeekPreviewPaywallSheet";
import { BuildShoppingListFromPlanSheet } from "@/components/plan/BuildShoppingListFromPlanSheet";
import { TagListEditor } from "@/components/ui/tag-list-editor";
import { createSharedPlan, type SharedPlanPayloadWeek } from "@/services/sharedPlan";
import {
  appendDayMenuShareLink,
  appendShareLinkOnce,
  buildDayMenuShareBody,
  buildWeekMenuShareBody,
  getShareIntroText,
  weekMealsBrief,
} from "@/utils/shareMenuText";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  A2HS_EVENT_AFTER_FIRST_DAY,
  A2HS_EVENT_AFTER_FIRST_WEEK,
} from "@/hooks/usePWAInstall";
import {
  getInfantNovelProductKeysForIntroduce,
  getInfantPrimaryProductSummaryLine,
  getIntroducingDisplayDay,
  getProductDisplayLabel,
  isIntroducingGracePeriod,
  isIntroducingPeriodActive,
  normalizeProductKeys,
  shouldAutoClearIntroducingPeriod,
  extractProductKeysForIntroduceClick,
} from "@/utils/introducedProducts";

const A2HS_FIRST_DAY_DISPATCHED_KEY = "a2hs_first_day_dispatched";
const A2HS_FIRST_WEEK_DISPATCHED_KEY = "a2hs_first_week_dispatched";

/** Краткие названия дней: Пн..Вс (индекс 0 = Пн, getDay() 1 = Пн). */
const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
function getDayLabel(date: Date): string {
  return weekDays[(date.getDay() + 6) % 7];
}

const PARTIAL_FILL_TOAST_DURATION_MS = 7000;
const PARTIAL_FILL_SUBTITLE = "Добавьте блюда из Избранного или создайте новые в чате с помощником.";

/** Сообщение для пользователя при сетевой ошибке (fetch/Edge Function). */
function planErrorMessage(raw: string, fallback: string): string {
  if (raw === "Failed to fetch" || (raw && raw.includes("NetworkError"))) {
    return "Не удалось подключиться к серверу. Проверьте интернет-соединение.";
  }
  return raw || fallback;
}

function parseTags(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function PartialFillToastActions({
  navigate,
  dismiss,
}: {
  navigate: (path: string, state?: object) => void;
  dismiss: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      <ToastAction
        altText="Открыть Избранное"
        onClick={() => {
          trackUsageEvent("partial_week_toast_favorites_click");
          dismiss();
          navigate("/favorites");
        }}
      >
        Избранное
      </ToastAction>
      <ToastAction
        altText="Подобрать в чате"
        onClick={() => {
          trackUsageEvent("partial_week_toast_assistant_click");
          dismiss();
          navigate("/chat");
        }}
      >
        Подобрать в чате
      </ToastAction>
    </div>
  );
}

function showPartialFillToast(
  toast: ReturnType<typeof useToast>["toast"],
  navigate: (path: string, state?: object) => void,
  options: { filled?: number; total?: number }
) {
  const { filled, total } = options;
  const title =
    filled != null && total != null ? `Подобрали ${filled} из ${total} блюд.` : "Подобрали часть блюд.";
  const r = toast({
    title,
    description: PARTIAL_FILL_SUBTITLE,
    duration: PARTIAL_FILL_TOAST_DURATION_MS,
  });
  r.update({ action: <PartialFillToastActions navigate={navigate} dismiss={r.dismiss} /> });
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

/** Месяца в родительном падеже для дат: "11 марта", "9 февраля". */
const MONTHS_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** Одна строка для hero Плана: «Воскресенье, 22 марта» (ru-RU, месяц в родительном падеже). Без префикса «Сегодня». */
function formatDayHeader(date: Date): string {
  const weekday = date.toLocaleDateString("ru-RU", { weekday: "long" });
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const day = date.getDate();
  const month = MONTHS_GENITIVE[date.getMonth()];
  return `${capitalized}, ${day} ${month}`;
}

export default function MealPlanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, authReady } = useAuth();
  const { updateMember, isUpdating: isUpdatingMember } = useMembers();
  const { selectedMember, members, selectedMemberId, setSelectedMemberId, isFreeLocked, isLoading: isMembersLoading } = useFamily();
  const [searchParams] = useSearchParams();
  const [justCreatedMemberId, setJustCreatedMemberIdState] = useState<string | null>(null);
  const [showWeekPreviewSheet, setShowWeekPreviewSheet] = useState(false);
  const [shoppingBuildSheetOpen, setShoppingBuildSheetOpen] = useState(false);
  const [planProfileHelpOpen, setPlanProfileHelpOpen] = useState(false);
  const [firstPlanShareBannerDismissed, setFirstPlanShareBannerDismissed] = useState(false);
  const [shareMenuPreview, setShareMenuPreview] = useState<
    | {
        kind: "day";
        meals: Array<{ meal_type: string; label: string; title: string }>;
        shareIntro: string;
      }
    | { kind: "week"; days: SharedPlanPayloadWeek["days"] }
    | null
  >(null);
  const [shareMenuSending, setShareMenuSending] = useState(false);
  const [introducedProductsDialogOpen, setIntroducedProductsDialogOpen] = useState(false);
  const [introducedProductsInput, setIntroducedProductsInput] = useState("");
  const [introduceConflictOpen, setIntroduceConflictOpen] = useState(false);
  const [introduceConflictPayload, setIntroduceConflictPayload] = useState<{
    primaryKey: string;
    extracted: string[];
    ingredientNames: string[];
    recipeTitle: string | null;
  } | null>(null);
  /** Подтверждение смены продукта введения при автозамене primary-слота. */
  const [infantReplacePrimaryConfirm, setInfantReplacePrimaryConfirm] = useState<{
    currentLabel: string;
    newLabel: string;
    picked: { id: string; title: string; firstNovelProductKey: string | null };
    slotId: string;
  } | null>(null);

  useEffect(() => {
    const id = consumeJustCreatedMemberId();
    if (id) setJustCreatedMemberIdState(id);
  }, []);

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
  const isInfantPlanUi = isInfantComplementaryPlanContext({
    memberId: mealPlanMemberId ?? null,
    isFamilyMode,
    ageMonths: selectedMember?.age_months ?? null,
  });
  const infantAgeMonths =
    selectedMember?.age_months != null && Number.isFinite(selectedMember.age_months)
      ? Math.max(0, Math.round(selectedMember.age_months))
      : null;
  /** Hero плана прикорма: строка про врача только при 4–5 мес; с 6 мес не показываем. */
  const showInfantComplementaryDoctorNotice =
    infantAgeMonths != null && infantAgeMonths >= 4 && infantAgeMonths < 6;
  const infantAgeBandU12 = useMemo(() => getInfantComplementaryAgeBandU12(infantAgeMonths), [infantAgeMonths]);
  const introducedProductKeys = useMemo(
    () =>
      Array.isArray((selectedMember as { introduced_product_keys?: unknown } | undefined)?.introduced_product_keys)
        ? ((selectedMember as { introduced_product_keys: string[] }).introduced_product_keys ?? [])
        : [],
    [selectedMember]
  );
  const { memberDataForPlan, starterProfile } = useMealPlanMemberData();

  const infantPoolMemberData = useMemo((): MemberDataForPool | null => {
    if (!memberDataForPlan || !("age_months" in memberDataForPlan) || memberDataForPlan.age_months == null) return null;
    return {
      allergies: memberDataForPlan.allergies,
      likes: "likes" in memberDataForPlan ? memberDataForPlan.likes : undefined,
      dislikes: "dislikes" in memberDataForPlan ? memberDataForPlan.dislikes : undefined,
      introduced_product_keys: "introduced_product_keys" in memberDataForPlan ? memberDataForPlan.introduced_product_keys : undefined,
      introducing_product_key: memberDataForPlan.introducing_product_key ?? null,
      introducing_started_at: memberDataForPlan.introducing_started_at ?? null,
      age_months: memberDataForPlan.age_months,
    };
  }, [memberDataForPlan]);

  const infantPoolIntroducingKey = useMemo(
    () =>
      JSON.stringify({
        k: memberDataForPlan?.introducing_product_key ?? null,
        s: memberDataForPlan?.introducing_started_at ?? null,
      }),
    [memberDataForPlan?.introducing_product_key, memberDataForPlan?.introducing_started_at]
  );

  const infantIntroducingBanner = useMemo(() => {
    if (!isInfantPlanUi || !selectedMember) return null;
    const m = selectedMember as MembersRow;
    const key = m.introducing_product_key;
    const started = m.introducing_started_at;
    if (!key?.trim() || !started) return null;
    const now = new Date();
    if (shouldAutoClearIntroducingPeriod(started, now)) return null;
    const label = getProductDisplayLabel(key);
    if (isIntroducingPeriodActive(key, started, now)) {
      const day = getIntroducingDisplayDay(started, now);
      if (day == null) return null;
      return { kind: "active" as const, label, day };
    }
    if (isIntroducingGracePeriod(key, started, now)) {
      return { kind: "grace" as const, label };
    }
    return null;
  }, [isInfantPlanUi, selectedMember]);

  const infantPoolAllergiesKey = useMemo(
    () => JSON.stringify(memberDataForPlan && "allergies" in memberDataForPlan ? memberDataForPlan.allergies ?? [] : []),
    [memberDataForPlan]
  );
  const infantPoolDislikesKey = useMemo(
    () => JSON.stringify(memberDataForPlan && "dislikes" in memberDataForPlan ? memberDataForPlan.dislikes ?? [] : []),
    [memberDataForPlan]
  );
  const infantPoolIntroducedKey = useMemo(
    () => JSON.stringify(memberDataForPlan && "introduced_product_keys" in memberDataForPlan ? memberDataForPlan.introduced_product_keys ?? [] : []),
    [memberDataForPlan]
  );

  const infantPoolQueryEnabled = Boolean(user?.id && isInfantPlanUi && infantPoolMemberData);

  const { data: infantNewRecipePoolRows = [], isLoading: infantNewRecipePoolLoading } = useQuery({
    queryKey: [
      "infant_plan_pool",
      "new_recipe",
      user?.id,
      mealPlanMemberId,
      infantPoolMemberData?.age_months,
      infantPoolAllergiesKey,
      infantPoolDislikesKey,
      infantPoolIntroducedKey,
      infantPoolIntroducingKey,
    ],
    queryFn: () =>
      listInfantNewRecipeCandidates({
        supabase,
        userId: user!.id,
        memberId: mealPlanMemberId ?? "",
        memberData: infantPoolMemberData,
        limitCandidates: 150,
      }),
    enabled: infantPoolQueryEnabled,
    staleTime: 120_000,
  });

  const { data: infantFamiliarRecipePoolRows = [], isLoading: infantFamiliarRecipePoolLoading } = useQuery({
    queryKey: [
      "infant_plan_pool",
      "familiar_recipe",
      user?.id,
      mealPlanMemberId,
      infantPoolMemberData?.age_months,
      infantPoolAllergiesKey,
      infantPoolDislikesKey,
      infantPoolIntroducedKey,
      infantPoolIntroducingKey,
    ],
    queryFn: () =>
      listInfantFamiliarRecipeCandidates({
        supabase,
        userId: user!.id,
        memberId: mealPlanMemberId ?? "",
        memberData: infantPoolMemberData,
        limitCandidates: 150,
      }),
    enabled: infantPoolQueryEnabled && introducedProductKeys.length > 0,
    staleTime: 120_000,
  });

  const infantPoolListsLoading =
    infantNewRecipePoolLoading || (introducedProductKeys.length > 0 && infantFamiliarRecipePoolLoading);
  /** Есть ли хотя бы один кандидат для экрана: newRecipe (primary) или familiarRecipe (secondary). */
  const infantPoolHasAnyCandidateForUi =
    infantNewRecipePoolRows.length > 0 ||
    (introducedProductKeys.length > 0 && infantFamiliarRecipePoolRows.length > 0);

  const [mutedWeekKey, setMutedWeekKey] = useState<string | null>(() => {
    if (typeof localStorage === "undefined") return null;
    const stored = localStorage.getItem(MEAL_PLAN_MUTED_WEEK_STORAGE_KEY);
    const currentStart = getRollingStartKey();
    return stored === currentStart ? stored : null;
  });
  const setMutedWeekKeyAndStorage = useCallback((key: string | null) => {
    setMutedWeekKey(key);
    if (typeof localStorage === "undefined") return;
    if (key) localStorage.setItem(MEAL_PLAN_MUTED_WEEK_STORAGE_KEY, key);
    else localStorage.removeItem(MEAL_PLAN_MUTED_WEEK_STORAGE_KEY);
  }, []);
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
  /** По умолчанию «Баланс»; повторный клик по чипу — сброс (null). Free: на Edge уходит только без selected_goal (см. selectGoalForEdge). */
  const [planGoalSelection, setPlanGoalSelection] = useState<string | null>("balanced");
  const selectedGoalForGeneratePlan = selectGoalForEdge(hasAccess, planGoalSelection);

  useEffect(() => {
    if (!hasAccess && planGoalSelection != null && planGoalSelection !== "balanced") {
      setPlanGoalSelection("balanced");
    }
  }, [hasAccess, planGoalSelection]);
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
    setPoolAutoReplaceCountBySlot({});
  }, [mealPlanMemberId]);

  const startKey = getRollingStartKey();
  const endKey = getRollingEndKey();
  const rollingDates = useMemo(() => getRolling7Dates(), [startKey]);
  const todayKey = formatLocalDate(new Date());

  const initialPlanRanRef = useRef(false);
  /** Инкремент при каждом запуске клиентского добора прикорма — отмена предыдущего async при смене дня/данных. */
  const infantClientFillRunRef = useRef(0);
  /** Один concurrent save на `${dayKey}:${mealType}` — без параллельных replace при моргании запросов. */
  const infantAutoFillSlotLocksRef = useRef<Set<string>>(new Set());

  const [replacingSlotKey, setReplacingSlotKey] = useState<string | null>(null);
  const [poolExhaustedContext, setPoolExhaustedContext] = useState<{
    dayKey: string;
    mealType: string;
    infantReason?: InfantPoolExhaustedReason;
  } | null>(null);
  /** Успешные pool-замены по ключу `${dayKey}_${mealType}` (только занятый слот, кнопка «Заменить» / подбор из пула). */
  const [poolAutoReplaceCountBySlot, setPoolAutoReplaceCountBySlot] = useState<Record<string, number>>({});
  /** История подошедших вариантов прикорма по ключу `${dayKey}_${mealType}`. */
  const [infantMatchedHistoryBySlot, setInfantMatchedHistoryBySlot] = useState<
    Record<string, Array<{ recipeId: string; title: string }>>
  >({});
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
        showPartialFillToast(toast, navigate, { filled, total });
      } else {
        toast({ description: planGenType === "week" ? "План на 7 дней готов" : "План на день готов", duration: 5000 });
        if (typeof window !== "undefined") {
          if (planGenType === "day" && localStorage.getItem(A2HS_FIRST_DAY_DISPATCHED_KEY) !== "1") {
            localStorage.setItem(A2HS_FIRST_DAY_DISPATCHED_KEY, "1");
            window.dispatchEvent(new CustomEvent(A2HS_EVENT_AFTER_FIRST_DAY));
          }
          if (planGenType === "week" && localStorage.getItem(A2HS_FIRST_WEEK_DISPATCHED_KEY) !== "1") {
            localStorage.setItem(A2HS_FIRST_WEEK_DISPATCHED_KEY, "1");
            window.dispatchEvent(new CustomEvent(A2HS_EVENT_AFTER_FIRST_WEEK));
          }
        }
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
  }, [planJob?.id, planJob?.status, planJob?.progress_done, planJob?.created_at, planGenType, planErrorText, queryClient, user?.id, memberIdForPlan, startKey, toast, navigate]);

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

  // Синхронизация URL ?memberId= & ?date= при заходе на План (редирект после создания члена семьи)
  useEffect(() => {
    if (location.pathname !== "/meal-plan" || members.length === 0) return;
    const urlMemberId = searchParams.get("memberId");
    const urlDate = searchParams.get("date");
    if (urlMemberId && members.some((m) => m.id === urlMemberId)) {
      setSelectedMemberId(urlMemberId);
    }
    if (urlDate && rollingDates.length > 0) {
      const idx = rollingDates.findIndex((d) => formatLocalDate(d) === urlDate);
      if (idx >= 0) setSelectedDay(idx);
    }
  }, [location.pathname, searchParams, members, rollingDates, setSelectedMemberId]);

  const { replaceMealSlotAuto, getFreeSwapUsedForDay, replaceSlotWithRecipe } = useReplaceMealSlot(
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
  /** Актуальные планы дня для проверок внутри async автодобора прикорма (избегаем гонок). */
  const dayMealPlansRef = useRef(dayMealPlans);
  dayMealPlansRef.current = dayMealPlans;
  const { data: rowExistsData } = getMealPlanRowExists(selectedDate);

  const clearSlotAndOpenPoolFallback = useCallback(
    async (ctx: {
      dayKey: string;
      mealType: string;
      planSlotId: string | null;
      infantReason?: InfantPoolExhaustedReason;
      skipClear?: boolean;
    }) => {
      if (ctx.skipClear) {
        setPoolExhaustedContext({
          dayKey: ctx.dayKey,
          mealType: ctx.mealType,
          infantReason: ctx.infantReason,
        });
        return;
      }
      if (ctx.planSlotId) {
        try {
          await deleteMealPlan(ctx.planSlotId);
          applyClearSlotToPlanCache(queryClient, { mealPlansKeyWeek, mealPlansKeyDay }, { dayKey: ctx.dayKey, mealType: ctx.mealType });
          await queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
        } catch (e: unknown) {
          toast({
            variant: "destructive",
            title: "Ошибка",
            description: e instanceof Error ? e.message : "Не удалось очистить слот",
          });
          return;
        }
      }
      setPoolExhaustedContext({
        dayKey: ctx.dayKey,
        mealType: ctx.mealType,
        infantReason: ctx.infantReason,
      });
    },
    [deleteMealPlan, queryClient, mealPlansKeyWeek, mealPlansKeyDay, user?.id, toast]
  );

  const appendInfantMatchedVariant = useCallback(
    (params: { dayKey: string; mealType: string; recipeId: string; title: string }) => {
      const slotDayKey = getSlotDayKey(params.dayKey, params.mealType);
      setInfantMatchedHistoryBySlot((prev) => {
        const current = prev[slotDayKey] ?? [];
        if (current.some((v) => v.recipeId === params.recipeId)) return prev;
        return {
          ...prev,
          [slotDayKey]: [...current, { recipeId: params.recipeId, title: params.title }],
        };
      });
    },
    []
  );

  useEffect(() => {
    setPoolAutoReplaceCountBySlot((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const k of Object.keys(next)) {
        if (!k.startsWith(`${selectedDayKey}_`)) continue;
        const mealTypeRest = k.slice(selectedDayKey.length + 1);
        const occupied = dayMealPlans.some(
          (p) => p.planned_date === selectedDayKey && p.meal_type === mealTypeRest && !!p.recipe_id
        );
        if (!occupied) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedDayKey, dayMealPlans]);
  /** Единый источник: dayMealPlans (развёрнутые слоты из одной строки). Пустой день только когда загрузка завершена и слотов с recipe_id нет. При refetch после fill не показываем empty. */
  const hasNoDishes = dayMealPlans.filter((p) => p.recipe_id).length === 0;
  /** Есть хотя бы одно блюдо в плане выбранного дня — для CTA «Отправить меню». */
  const dayHasShareableMeals = !hasNoDishes;
  const isEmptyDay = !isLoading && !isFetching && hasNoDishes;
  /** Последняя генерация завершилась с сообщением «нет рецептов для взрослого» — показываем отдельный empty state. */
  const isAdultNoRecipesEmpty =
    isEmptyDay && !!planJob?.status && planJob.status === "done" && (planJob.error_text ?? "").includes("взрослого профиля");

  const showInfantPoolExhaustedFallback =
    isInfantPlanUi &&
    !isAdultNoRecipesEmpty &&
    !infantPoolListsLoading &&
    !infantPoolHasAnyCandidateForUi;

  const saveIntroducedProductKeys = useCallback(async (nextKeys: string[]) => {
    if (!selectedMember?.id) return;
    try {
      await updateMember({
        id: selectedMember.id,
        introduced_product_keys: Array.from(new Set(nextKeys.filter(Boolean))),
      });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Не удалось сохранить",
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
      throw e;
    }
  }, [selectedMember?.id, toast, updateMember]);

  const clearIntroducingPeriod = useCallback(async () => {
    if (!selectedMember?.id) return;
    try {
      await updateMember({
        id: selectedMember.id,
        introducing_product_key: null,
        introducing_started_at: null,
      });
      toast({ description: "Период введения завершён" });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Не удалось сохранить",
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    }
  }, [selectedMember?.id, toast, updateMember]);

  /** Grace 3–4 дня: вернуться к «дню 2» (вчера как дата старта). */
  const continueIntroducingFromGrace = useCallback(async () => {
    if (!selectedMember?.id) return;
    const m = selectedMember as MembersRow;
    const key = m.introducing_product_key;
    if (!key?.trim()) return;
    const today = formatLocalDate(new Date());
    const yesterday = addDaysToLocalYmd(today, -1);
    try {
      await updateMember({
        id: selectedMember.id,
        introducing_product_key: key,
        introducing_started_at: yesterday,
      });
      toast({ description: "Продолжаем введение" });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Не удалось сохранить",
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    }
  }, [selectedMember, toast, updateMember]);

  const tryNewIntroducingProduct = useCallback(async () => {
    if (!selectedMember?.id) return;
    try {
      await updateMember({
        id: selectedMember.id,
        introducing_product_key: null,
        introducing_started_at: null,
      });
      toast({ description: "Можно начать вводить другой продукт" });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Не удалось сохранить",
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    }
  }, [selectedMember?.id, toast, updateMember]);

  /** Окно наблюдения (grace): «всё хорошо» — продукт в список введённых, сброс периода. */
  const introducingReactionOk = useCallback(async () => {
    if (!selectedMember?.id) return;
    const m = selectedMember as MembersRow;
    const key = m.introducing_product_key;
    if (!key?.trim()) return;
    const nextKeys = introducedProductKeys.includes(key)
      ? introducedProductKeys
      : Array.from(new Set([...introducedProductKeys, key]));
    try {
      await updateMember({
        id: selectedMember.id,
        introducing_product_key: null,
        introducing_started_at: null,
        introduced_product_keys: nextKeys,
      });
      toast({ description: "Отлично, продукт можно считать введённым" });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Не удалось сохранить",
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    }
  }, [introducedProductKeys, selectedMember, toast, updateMember]);

  const introducingReactionDislike = useCallback(async () => {
    if (!selectedMember?.id) return;
    try {
      await updateMember({
        id: selectedMember.id,
        introducing_product_key: null,
        introducing_started_at: null,
      });
      toast({ description: "Можно попробовать этот продукт позже в другом виде" });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Не удалось сохранить",
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    }
  }, [selectedMember?.id, toast, updateMember]);

  const introducingReactionIssue = useCallback(async () => {
    if (!selectedMember?.id) return;
    try {
      await updateMember({
        id: selectedMember.id,
        introducing_product_key: null,
        introducing_started_at: null,
      });
      const r = toast({
        title: "Если есть сомнения",
        description:
          "В «Помощь маме» есть материалы про реакции на новые продукты. При тяжёлых симптомах обратитесь к врачу.",
        duration: 12_000,
      });
      r.update({
        action: (
          <ToastAction
            altText="Открыть Помощь маме"
            onClick={() => {
              r.dismiss();
              navigate("/sos");
            }}
          >
            Помощь маме
          </ToastAction>
        ),
      });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Не удалось сохранить",
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    }
  }, [navigate, selectedMember?.id, toast, updateMember]);

  const addIntroducedFromRecipe = useCallback(
    async (args: {
      ingredientNames: string[] | undefined;
      recipeTitle?: string | null;
      forceSwitchProduct?: boolean;
    }) => {
      const { ingredientNames, recipeTitle, forceSwitchProduct = false } = args;
      if (!selectedMember?.id) return;
      const extracted = extractProductKeysForIntroduceClick(ingredientNames, recipeTitle ?? null);
      if (extracted.length === 0) {
        toast({ description: "Не нашли подходящий продукт для отметки." });
        return;
      }
      const introducedSet = new Set(introducedProductKeys);
      const novelKeys = extracted.filter((k) => !introducedSet.has(k));
      if (novelKeys.length === 0) {
        toast({ description: "Все продукты этого блюда уже в списке введённых." });
        return;
      }
      const primaryKey = novelKeys[0];
      const m = selectedMember as MembersRow;
      const curKey = m.introducing_product_key;
      const curStarted = m.introducing_started_at;
      const now = new Date();

      const inGrace =
        !!curKey &&
        !!curStarted &&
        isIntroducingGracePeriod(curKey, curStarted, now);

      if (inGrace) {
        const today = formatLocalDate(now);
        const nextKeys = Array.from(new Set([...introducedProductKeys, ...extracted]));
        const yesterday = addDaysToLocalYmd(today, -1);
        try {
          if (primaryKey === curKey) {
            await updateMember({
              id: selectedMember.id,
              introduced_product_keys: nextKeys,
              introducing_product_key: curKey,
              introducing_started_at: yesterday,
            });
          } else {
            await updateMember({
              id: selectedMember.id,
              introduced_product_keys: nextKeys,
              introducing_product_key: primaryKey,
              introducing_started_at: today,
            });
          }
          toast({ description: `Отметили: ${extracted.map((k) => getProductDisplayLabel(k)).join(", ")}` });
        } catch (e: unknown) {
          toast({
            variant: "destructive",
            title: "Не удалось сохранить",
            description: e instanceof Error ? e.message : "Попробуйте ещё раз",
          });
        }
        return;
      }

      const periodActive = !!curKey && !!curStarted && isIntroducingPeriodActive(curKey, curStarted, now);

      if (periodActive && !forceSwitchProduct && primaryKey !== curKey) {
        setIntroduceConflictPayload({
          primaryKey,
          extracted,
          ingredientNames: ingredientNames ?? [],
          recipeTitle: recipeTitle ?? null,
        });
        setIntroduceConflictOpen(true);
        return;
      }

      const today = formatLocalDate(now);
      const nextKeys = Array.from(new Set([...introducedProductKeys, ...extracted]));

      let nextIntroKey: string | null = curKey ?? null;
      let nextIntroStarted: string | null = curStarted ?? null;

      if (!periodActive) {
        nextIntroKey = primaryKey;
        nextIntroStarted = today;
      } else if (primaryKey === curKey) {
        nextIntroKey = curKey;
        nextIntroStarted = curStarted;
      } else if (forceSwitchProduct) {
        nextIntroKey = primaryKey;
        nextIntroStarted = today;
      }

      try {
        await updateMember({
          id: selectedMember.id,
          introduced_product_keys: nextKeys,
          introducing_product_key: nextIntroKey,
          introducing_started_at: nextIntroStarted,
        });
        toast({ description: `Отметили: ${extracted.map((k) => getProductDisplayLabel(k)).join(", ")}` });
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Не удалось сохранить",
          description: e instanceof Error ? e.message : "Попробуйте ещё раз",
        });
      }
    },
    [introducedProductKeys, selectedMember, toast, updateMember]
  );

  useEffect(() => {
    if (!selectedMember?.id || !isInfantPlanUi) return;
    const started = (selectedMember as MembersRow).introducing_started_at;
    if (!started || !shouldAutoClearIntroducingPeriod(started, new Date())) return;
    void updateMember({
      id: selectedMember.id,
      introducing_product_key: null,
      introducing_started_at: null,
    });
  }, [isInfantPlanUi, selectedMember?.id, selectedMember?.introducing_started_at, updateMember]);

  const planReadyToastShownRef = useRef(false);
  useEffect(() => {
    if (!justCreatedMemberId || planReadyToastShownRef.current) return;
    if (isLoading || isFetching) return;
    planReadyToastShownRef.current = true;
    // Не сбрасываем justCreatedMemberId здесь — баннер «План готов» / «Отправить меню» остаётся до закрытия пользователем
    const t = toast({
      title: "План питания на сегодня готов 🍽",
      description: "Мы подобрали меню на сегодня",
    });
    const timeoutId = setTimeout(() => t.dismiss(), 2000);
    return () => clearTimeout(timeoutId);
  }, [justCreatedMemberId, isLoading, isFetching, toast]);

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

  const weekPreviewData = useMemo((): { previewDayLabel: string; previewMeals: PreviewMeal[] } => {
    const placeholderMeals: PreviewMeal[] = [
      { meal_type: "breakfast", label: "Завтрак", title: "Сырники" },
      { meal_type: "lunch", label: "Обед", title: "Суп-пюре" },
      { meal_type: "snack", label: "Полдник", title: "Фруктовый перекус" },
      { meal_type: "dinner", label: "Ужин", title: "Индейка с овощами" },
    ].map((m) => ({ ...m, title: m.title + " (пример)" }));
    const tomorrowKey = rollingDates.length > 1 ? formatLocalDate(rollingDates[1]) : todayKey;
    const tomorrowMeals = weekPlans.filter((p) => p.planned_date === tomorrowKey);
    const todayMeals = weekPlans.filter((p) => p.planned_date === todayKey);
    const source = tomorrowMeals.length > 0 ? tomorrowMeals : todayMeals;
    const label = tomorrowMeals.length > 0 ? "Завтра" : "Сегодня";
    if (source.length === 0) return { previewDayLabel: label, previewMeals: placeholderMeals };
    const byType: PreviewMeal[] = mealTypes.map((mt) => ({
      meal_type: mt.id,
      label: mt.label,
      title: source.find((p) => p.meal_type === mt.id)?.recipe?.title ?? `${mt.label} (пример)`,
    }));
    return { previewDayLabel: label, previewMeals: byType };
  }, [weekPlans, rollingDates, todayKey]);

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

  /**
   * Прикорм (клиентский pick/fill/replace): исключения только по **выбранному дню** + session.
   * Недельный merge (`replaceExclude*Merged`) сжимал кандидатов (все блюда недели сразу) и давал
   * ложное `candidates_exhausted` после пары замен при большом пуле.
   */
  const infantDayReplaceExcludeRecipeIdsMerged = useMemo(
    () =>
      [
        ...new Set([
          ...(weekPlans
            .filter((p) => p.planned_date === selectedDayKey)
            .map((p) => p.recipe_id)
            .filter(Boolean) as string[]),
          ...(sessionExcludeRecipeIds[selectedDayKey] ?? []),
        ]),
      ],
    [weekPlans, selectedDayKey, sessionExcludeRecipeIds]
  );
  const infantDayReplaceExcludeTitleKeysMerged = useMemo(
    () =>
      [
        ...new Set([
          ...weekPlans
            .filter((p) => p.planned_date === selectedDayKey)
            .map((p) => normalizeTitleKey((p.recipe?.title ?? "") || ""))
            .filter(Boolean),
          ...(sessionExcludeTitleKeys[selectedDayKey] ?? []),
        ]),
      ],
    [weekPlans, selectedDayKey, sessionExcludeTitleKeys]
  );

  const isInfantPremiumAutoreplace = isInfantAutoreplaceContext({
    isInfantPlanUi,
    isFree,
  });

  const slotAutoReplaceLimit = getAutoReplaceLimitPerSlotPerDay({
    isInfantPremiumContext: isInfantPremiumAutoreplace,
  });

  const infantPoolExhaustedOptions = useMemo(() => {
    if (!poolExhaustedContext) return [];
    const key = getSlotDayKey(poolExhaustedContext.dayKey, poolExhaustedContext.mealType);
    return infantMatchedHistoryBySlot[key] ?? [];
  }, [poolExhaustedContext, infantMatchedHistoryBySlot]);

  /** Смена дня: не держим «замену» от предыдущего дня — иначе блокируется ↻ и добор. */
  useEffect(() => {
    setReplacingSlotKey(null);
  }, [selectedDayKey]);

  /** Смена дня: сброс блокировок автодобора прикорма. */
  useEffect(() => {
    infantAutoFillSlotLocksRef.current.clear();
  }, [selectedDayKey]);

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
      ...(selectedGoalForGeneratePlan ? { selected_goal: selectedGoalForGeneratePlan } : {}),
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

  const openShareDayPreview = useCallback(() => {
    const meals = dayMealPlans
      .filter((p) => p.recipe_id)
      .map((p) => ({
        meal_type: p.meal_type,
        label: mealTypes.find((m) => m.id === p.meal_type)?.label ?? p.meal_type,
        title: p.recipe?.title ?? previews[p.recipe_id ?? ""]?.title ?? "Блюдо",
      }));
    if (meals.length === 0) {
      toast({ description: "Добавьте блюда в план дня, чтобы поделиться" });
      return;
    }
    setShareMenuPreview({
      kind: "day",
      meals,
      shareIntro: getShareIntroText(new Date()),
    });
  }, [dayMealPlans, mealTypes, previews, toast]);

  const openShareWeekPreview = useCallback(() => {
    if (!user?.id) return;
    const days: SharedPlanPayloadWeek["days"] = dayKeys.map((dayKey, i) => {
      const dayPlans = weekPlans.filter((p) => p.planned_date === dayKey);
      const meals = dayPlans
        .filter((p) => p.recipe_id)
        .map((p) => ({ slot: p.meal_type, title: p.recipe?.title ?? "Блюдо" }));
      const date = rollingDates[i];
      const label = date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
      const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
      return { date: dayKey, label: capitalized, meals };
    });
    setShareMenuPreview({ kind: "week", days });
  }, [user?.id, dayKeys, weekPlans, rollingDates]);

  const confirmShareMenuPreview = useCallback(async () => {
    if (!shareMenuPreview || !user?.id) return;
    setShareMenuSending(true);
    try {
      if (shareMenuPreview.kind === "day") {
        const { url } = await createSharedPlan(user.id, memberIdForPlan, {
          date: selectedDayKey,
          meals: shareMenuPreview.meals,
        });
        const body = buildDayMenuShareBody(shareMenuPreview.meals, {
          intro: shareMenuPreview.shareIntro,
        });
        const fullText = appendDayMenuShareLink(body, url);
        let sharedOk = false;
        if (typeof navigator !== "undefined" && navigator.share) {
          await navigator.share({ title: "Меню на день", text: fullText });
          sharedOk = true;
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(fullText);
          toast({ title: "Скопировано", description: "Текст со ссылкой в буфере обмена" });
          sharedOk = true;
        } else {
          toast({ variant: "destructive", description: "Не удалось скопировать: браузер не поддерживает буфер обмена" });
        }
        if (sharedOk) setShareMenuPreview(null);
        return;
      }
      const { url } = await createSharedPlan(user.id, memberIdForPlan, {
        type: "week",
        startDate: dayKeys[0],
        endDate: dayKeys[6],
        days: shareMenuPreview.days,
      });
      const dayRows = shareMenuPreview.days.map((d, i) => ({
        dayShort: getDayLabel(rollingDates[i]),
        brief: weekMealsBrief(d.meals),
      }));
      const body = buildWeekMenuShareBody(dayRows);
      const fullText = appendShareLinkOnce(body, url);
      let sharedOk = false;
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Меню на неделю", text: fullText });
        sharedOk = true;
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullText);
        toast({ title: "Скопировано", description: "Текст со ссылкой в буфере обмена" });
        sharedOk = true;
      } else {
        toast({ variant: "destructive", description: "Не удалось скопировать: браузер не поддерживает буфер обмена" });
      }
      if (sharedOk) setShareMenuPreview(null);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      toast({ variant: "destructive", description: e instanceof Error ? e.message : "Не удалось поделиться" });
    } finally {
      setShareMenuSending(false);
    }
  }, [
    shareMenuPreview,
    user?.id,
    memberIdForPlan,
    selectedDayKey,
    dayKeys,
    rollingDates,
    toast,
  ]);

  const shareMenuPreviewBody = useMemo(() => {
    if (!shareMenuPreview) return "";
    if (shareMenuPreview.kind === "day") {
      return buildDayMenuShareBody(shareMenuPreview.meals, {
        intro: shareMenuPreview.shareIntro,
      });
    }
    return buildWeekMenuShareBody(
      shareMenuPreview.days.map((d, i) => ({
        dayShort: getDayLabel(rollingDates[i]),
        brief: weekMealsBrief(d.meals),
      })),
    );
  }, [shareMenuPreview, rollingDates]);

  // Группируем планы по типу приема пищи
  const mealsByType = mealTypes.reduce((acc, mealType) => {
    const plan = dayMealPlans.find((mp) => mp.meal_type === mealType.id);
    acc[mealType.id] = plan || null;
    return acc;
  }, {} as Record<string, typeof dayMealPlans[0] | null>);

  /**
   * Прикорм &lt;12: роли newRecipe / familiarRecipe; в БД — carrier `breakfast` / `lunch` (см. infantComplementaryPlan).
   * Второй блок показываем при любых введённых продуктах — даже если пул familiar пока пуст.
   */
  const infantSlotsForRender = useMemo(() => {
    if (!isInfantPlanUi) return null;
    const out: Array<{ id: string; label: string; sectionHeading: string }> = [
      {
        id: INFANT_PLAN_SLOT_NEW_PRODUCT,
        sectionHeading: "Новый продукт",
        label: "Новинка",
      },
    ];
    if (introducedProductKeys.length > 0) {
      out.push({
        id: INFANT_PLAN_SLOT_FAMILIAR,
        sectionHeading: "Уже знакомое блюдо",
        label: "Знакомое",
      });
    }
    return out;
  }, [isInfantPlanUi, introducedProductKeys.length]);

  const planSlotsForRender = isInfantPlanUi && infantSlotsForRender ? infantSlotsForRender : mealTypes;

  /** Первый пустой слот по порядку infantSlotsForRender / mealTypes: подсветка empty UI для первого из списка. */
  const firstEmptySlotId = useMemo(() => {
    for (const slot of planSlotsForRender) {
      const plannedMeal = mealsByType[slot.id];
      const recipe = plannedMeal ? getPlannedMealRecipe(plannedMeal) : null;
      const recipeId = plannedMeal ? getPlannedMealRecipeId(plannedMeal) : null;
      const hasDish = !!(plannedMeal && recipeId && recipe?.title);
      if (!hasDish) return slot.id;
    }
    return null;
  }, [mealsByType, planSlotsForRender]);

  /** Сводка слотов выбранного дня — в deps автодобора вместо всего dayMealPlans (меньше лишних перезапусков и моргания). */
  const infantDaySlotsSignature = useMemo(
    () =>
      dayMealPlans
        .filter((p) => p.planned_date === selectedDayKey)
        .map((p) => `${p.meal_type}:${p.recipe_id ?? ""}`)
        .sort()
        .join("|"),
    [dayMealPlans, selectedDayKey]
  );

  /**
   * Прикорм &lt;12: пустые слоты выбранного дня добираем из клиентского пула (как «Показать другой вариант», без Edge).
   * После удаления блюда / перехода на день без recipe_id в expand — подбор снова запускается.
   */
  useEffect(() => {
    if (!isInfantPlanUi || !user?.id || !infantPoolMemberData || !mealPlanMemberId) return;
    if (showInfantPoolExhaustedFallback) return;
    if (infantPoolListsLoading) return;
    if (isLoading || isFetching) return;

    const slots = infantSlotsForRender;
    if (!slots?.length) return;

    const emptySlots = slots.filter((slot) => {
      const plannedMeal = dayMealPlans.find(
        (p) => p.planned_date === selectedDayKey && p.meal_type === slot.id
      );
      if (!plannedMeal) return true;
      const recipe = getPlannedMealRecipe(plannedMeal);
      const rid = getPlannedMealRecipeId(plannedMeal);
      return !(rid && recipe?.title);
    });
    if (emptySlots.length === 0) return;

    const runId = ++infantClientFillRunRef.current;
    let cancelled = false;

    void (async () => {
      const filledRecipeIds: string[] = [];
      const filledTitleKeys: string[] = [];

      for (const slot of emptySlots) {
        if (cancelled || runId !== infantClientFillRunRef.current) return;

        const baseExcludeIds = [...new Set([...infantDayReplaceExcludeRecipeIdsMerged, ...filledRecipeIds])];
        const baseExcludeKeys = [...new Set([...infantDayReplaceExcludeTitleKeysMerged, ...filledTitleKeys])];

        let candidatesAfterFilter: number | null = null;
        const isNewSlot = isInfantNewRecipePlanSlot(slot.id);

        if (import.meta.env.DEV || isPlanDebug()) {
          const listed = isNewSlot
            ? await listInfantNewRecipeCandidates({
                supabase,
                userId: user.id,
                memberId: mealPlanMemberId,
                memberData: infantPoolMemberData,
                excludeRecipeIds: baseExcludeIds,
                excludeTitleKeys: baseExcludeKeys,
                limitCandidates: 150,
              })
            : await listInfantFamiliarRecipeCandidates({
                supabase,
                userId: user.id,
                memberId: mealPlanMemberId,
                memberData: infantPoolMemberData,
                excludeRecipeIds: baseExcludeIds,
                excludeTitleKeys: baseExcludeKeys,
                limitCandidates: 150,
              });
          candidatesAfterFilter = listed.length;
        }

        let picked = isNewSlot
          ? await pickInfantNewRecipe({
              supabase,
              userId: user.id,
              memberId: mealPlanMemberId,
              memberData: infantPoolMemberData,
              excludeRecipeIds: baseExcludeIds,
              excludeTitleKeys: baseExcludeKeys,
              limitCandidates: 150,
            })
          : await pickInfantFamiliarRecipe({
              supabase,
              userId: user.id,
              memberId: mealPlanMemberId,
              memberData: infantPoolMemberData,
              excludeRecipeIds: baseExcludeIds,
              excludeTitleKeys: baseExcludeKeys,
              limitCandidates: 150,
            });
        let usedRelaxedExcludes = false;
        if (!picked) {
          usedRelaxedExcludes = true;
          picked = isNewSlot
            ? await pickInfantNewRecipe({
                supabase,
                userId: user.id,
                memberId: mealPlanMemberId,
                memberData: infantPoolMemberData,
                excludeRecipeIds: [],
                excludeTitleKeys: [],
                limitCandidates: 200,
              })
            : await pickInfantFamiliarRecipe({
                supabase,
                userId: user.id,
                memberId: mealPlanMemberId,
                memberData: infantPoolMemberData,
                excludeRecipeIds: [],
                excludeTitleKeys: [],
                limitCandidates: 200,
              });
        }

        if (import.meta.env.DEV || isPlanDebug()) {
          console.log("[infant_plan_fill]", {
            slot: slot.id,
            day_key: selectedDayKey,
            age_months: infantPoolMemberData.age_months,
            usedRecipeIds: baseExcludeIds,
            candidatesAfterFilter,
            pickedId: picked?.id ?? null,
            usedRelaxedExcludes: usedRelaxedExcludes && !!picked,
          });
        }

        if (!picked) continue;

        if (cancelled || runId !== infantClientFillRunRef.current) return;

        const lockKey = `${selectedDayKey}:${slot.id}`;
        if (infantAutoFillSlotLocksRef.current.has(lockKey)) continue;

        const cur = dayMealPlansRef.current.find(
          (p) => p.planned_date === selectedDayKey && p.meal_type === slot.id
        );
        const curRecipe = cur ? getPlannedMealRecipe(cur) : null;
        const curRid = cur ? getPlannedMealRecipeId(cur) : null;
        if (cur && curRid && curRecipe?.title) continue;

        infantAutoFillSlotLocksRef.current.add(lockKey);
        try {
          await replaceSlotWithRecipe(
            {
              dayKey: selectedDayKey,
              mealType: slot.id,
              recipeId: picked.id,
              recipeTitle: picked.title,
            },
            { skipInvalidate: true }
          );
        } catch (e: unknown) {
          if (!cancelled && runId === infantClientFillRunRef.current) {
            toast({
              variant: "destructive",
              title: "Не удалось сохранить блюдо",
              description: e instanceof Error ? e.message : "Попробуйте ещё раз",
            });
          }
          return;
        } finally {
          infantAutoFillSlotLocksRef.current.delete(lockKey);
        }

        if (cancelled || runId !== infantClientFillRunRef.current) return;

        applyReplaceSlotToPlanCache(
          queryClient,
          { mealPlansKeyWeek, mealPlansKeyDay },
          {
            dayKey: selectedDayKey,
            mealType: slot.id,
            newRecipeId: picked.id,
            title: picked.title,
            plan_source: "pool",
          },
          mealPlanMemberId ?? null
        );
        filledRecipeIds.push(picked.id);
        filledTitleKeys.push(normalizeTitleKey(picked.title));
        setSessionExcludeRecipeIds((prev) => ({
          ...prev,
          [selectedDayKey]: [...(prev[selectedDayKey] ?? []), picked.id],
        }));
        setSessionExcludeTitleKeys((prev) => ({
          ...prev,
          [selectedDayKey]: [...(prev[selectedDayKey] ?? []), normalizeTitleKey(picked.title)],
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isInfantPlanUi,
    user?.id,
    infantPoolMemberData,
    mealPlanMemberId,
    showInfantPoolExhaustedFallback,
    infantPoolListsLoading,
    isLoading,
    isFetching,
    infantSlotsForRender,
    infantDaySlotsSignature,
    selectedDayKey,
    infantDayReplaceExcludeRecipeIdsMerged,
    infantDayReplaceExcludeTitleKeysMerged,
    replaceSlotWithRecipe,
    queryClient,
    mealPlansKeyWeek,
    mealPlansKeyDay,
    toast,
  ]);

  const planDebug = isPlanDebug();

  const showNoProfile = authReady && !!user && !isMembersLoading && members.length === 0;
  const showEmptyFamily = isFamilyMode && showNoProfile;

  useEffect(() => {
    if (import.meta.env.DEV && (showNoProfile || showEmptyFamily)) {
      logEmptyOnboardingReason(showEmptyFamily ? "meal-plan (family)" : "meal-plan", "members empty", {
        hasUser: !!user,
        isLoadingMembers: isMembersLoading,
        membersCount: members.length,
      });
    }
  }, [showNoProfile, showEmptyFamily, user, isMembersLoading, members.length]);

  const planViewDayTrackedRef = useRef(false);
  useEffect(() => {
    if (location.pathname !== "/meal-plan" || showNoProfile || showEmptyFamily || planViewDayTrackedRef.current) return;
    planViewDayTrackedRef.current = true;
    trackUsageEvent("plan_view_day");
  }, [location.pathname, showNoProfile, showEmptyFamily]);

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

  if (!authReady || isMembersLoading) {
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
    <MobileLayout mainClassName={isInfantPlanUi ? "scrollbar-none !overflow-y-hidden" : undefined}>
      <div className="flex flex-col min-h-0 flex-1 px-4 relative overflow-x-hidden touch-pan-y overscroll-x-none max-w-full">
        {/* Верхний ряд — снаружи скролла, как на вкладке Чат (иначе ряд оказывается на высоте «тела» чата, а не sticky-хедера). */}
        <div className="sticky top-0 z-10 shrink-0 bg-background/95 backdrop-blur-sm pt-2 pb-2">
          <TabProfileMenuRow
            profileSlot={
              members.length > 0 ? (
                isInfantPlanUi ? (
                  <MemberSelectorButton
                    className="shrink-0"
                    disabled={isAnyGenerating}
                    leadingEmoji="👶"
                    fitLabelWidth
                  />
                ) : (
                  <MemberSelectorButton className="shrink-0" disabled={isAnyGenerating} />
                )
              ) : (
                <span className="block min-h-[44px] w-full min-w-0" aria-hidden />
              )
            }
            trailing={
              <>
                <SubscriptionTierBadge subscriptionStatus={subscriptionStatus} label={statusBadgeLabel} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <TabOverflowIconButton disabled={isAnyGenerating} aria-label="Ещё действия" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {members.length > 0 && (
                      <DropdownMenuItem
                        onClick={() => setPlanProfileHelpOpen(true)}
                        className="text-muted-foreground"
                      >
                        <Info className="w-4 h-4 mr-2 shrink-0" />
                        Как учитывается профиль
                      </DropdownMenuItem>
                    )}
                    {hasAccess && !isInfantPlanUi && (
                      <DropdownMenuItem
                        onClick={() => openShareWeekPreview()}
                        disabled={isAnyGenerating || isWeekPlansLoading}
                        className="text-muted-foreground"
                      >
                        <ShareIosIcon className="w-4 h-4 mr-2 shrink-0" />
                        Отправить меню на неделю
                      </DropdownMenuItem>
                    )}
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
              </>
            }
          />
        </div>
        {/* Content wrapper: один скролл + subtle pattern; горизонтальный скролл/overscroll отключены */}
        <div
          ref={scrollContainerRef}
          className={cn(
            "plan-page-bg relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden touch-pan-y overscroll-x-none",
            isInfantPlanUi && "scrollbar-none",
          )}
        >
          {/* Блок приглашения к шарингу после первой генерации */}
          {justCreatedMemberId && !firstPlanShareBannerDismissed && !isInfantPlanUi && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl bg-card border border-border/70 shadow-[0_1px_6px_-2px_rgba(0,0,0,0.05)] p-4 mb-3 relative"
            >
              <button
                type="button"
                onClick={() => {
                  setFirstPlanShareBannerDismissed(true);
                  setJustCreatedMemberIdState(null);
                }}
                className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                aria-label="Закрыть"
              >
                <span className="text-lg leading-none">×</span>
              </button>
              <p className="text-sm font-medium text-foreground pr-6 mb-1">
                План готов! 🎉
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Многие родители делятся такими меню<br />в семейных чатах.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-lg border-border/70 bg-background text-primary hover:bg-muted/50 text-xs font-medium gap-1.5"
                onClick={openShareDayPreview}
                disabled={isAnyGenerating || !dayHasShareableMeals}
              >
                <ShareIosIcon className="w-4 h-4 shrink-0" />
                Отправить меню
              </Button>
              {dayHasShareableMeals ? (
                <p className="text-[10px] text-muted-foreground mt-1.5">Покажите близким или сохраните себе</p>
              ) : null}
            </motion.div>
          )}
          {/* 1) Hero: «Собрать день» + «Собрать неделю»; отправка меню — под списком блюд */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={cn(
              "rounded-2xl bg-card/70 border-0 shadow-none ring-1 ring-border/20",
              isInfantPlanUi ? "p-2.5 sm:p-3.5 mb-1.5" : "p-3 sm:p-4 mb-2",
            )}
          >
            {isInfantPlanUi ? (
              <>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-foreground leading-tight tracking-tight">
                    План прикорма на сегодня
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{formatDayHeader(selectedDate)}</p>
                </div>
                <div className="w-full min-w-0 mt-1 space-y-2">
                  <div
                    className="mt-0.5 w-full min-w-0 rounded-xl border border-border/45 bg-muted/15 px-3 py-2.5 space-y-1.5"
                    role="region"
                    aria-label="Справка о прикорме"
                  >
                    {showInfantComplementaryDoctorNotice ? (
                      <p
                        className="text-xs font-medium leading-snug text-amber-950/85 dark:text-amber-100/90 rounded-md bg-amber-500/[0.09] border border-amber-500/20 px-2 py-1.5"
                        role="status"
                      >
                        В 4–5 месяцев прикорм вводят только по согласованию с врачом.
                      </p>
                    ) : null}
                    <p className="text-[12px] sm:text-[13px] leading-[1.45] font-normal text-muted-foreground w-full min-w-0">
                      Основное питание — грудное молоко или смесь. Прикорм вводится постепенно, обычно 1–2 раза в день.
                    </p>
                    <p className="text-[11px] sm:text-xs leading-snug text-muted-foreground/80 w-full min-w-0">
                      Подробнее о прикорме — в разделе ниже.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 w-full min-w-0 items-stretch sm:items-start pt-1">
                    <Link
                      to="/sos"
                      className="group flex min-h-[44px] w-full max-w-[min(21rem,100%)] sm:max-w-[50%] min-w-[min(100%,11rem)] items-center justify-between gap-2.5 rounded-xl border border-border/55 bg-transparent px-3 py-2 text-left transition-colors hover:bg-muted/30 hover:border-border/70 active:scale-[0.99]"
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/40 text-muted-foreground ring-1 ring-border/50 group-hover:text-foreground group-hover:ring-border/60">
                          <HeartHandshake className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <span className="font-medium text-muted-foreground text-sm leading-tight group-hover:text-foreground">
                          Помощь маме
                        </span>
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                        aria-hidden
                      />
                    </Link>
                    <button
                      type="button"
                      className="flex min-h-10 w-full max-w-[min(21rem,100%)] sm:max-w-[50%] min-w-[min(100%,11rem)] items-center justify-center rounded-lg border border-transparent bg-transparent px-2 py-2 text-xs font-normal text-muted-foreground/90 transition-colors hover:bg-muted/25 hover:text-foreground active:scale-[0.99]"
                      onClick={() => setIntroducedProductsDialogOpen(true)}
                    >
                      Уже введённые продукты
                    </button>
                  </div>
                </div>
              </>
            ) : (
            <div className="flex min-w-0 flex-col gap-2">
              <h2
                className={cn(
                  "text-lg font-semibold text-foreground leading-tight tracking-tight",
                  "text-balance",
                )}
              >
                {formatDayHeader(selectedDate)}
              </h2>
              {members.length > 0 ? (
                <div className="mt-1 flex w-full min-w-0 flex-wrap items-center justify-start gap-3">
                  <PlanGoalCompactSheet
                    value={planGoalSelection}
                    onChange={setPlanGoalSelection}
                    className="shrink-0"
                    disabled={isAnyGenerating}
                    hasPremiumAccess={hasAccess}
                    onLockedGoalClick={() => {
                      useAppStore.getState().setPaywallReason("plan_goal_select");
                      useAppStore.getState().setPaywallCustomMessage(
                        "Эти блюда подбираются с учётом цели питания. В Premium и Trial можно выбрать фокус подбора (Железо, Концентрация и др.).",
                      );
                      useAppStore.getState().setShowPaywall(true);
                    }}
                  />
                </div>
              ) : null}
              {planDebug && (dayDbCount > 0 || dayAiCount > 0) && (
                <span className="text-xs text-slate-500">DB: {dayDbCount} | AI: {dayAiCount}</span>
              )}
            </div>
            )}
            {!isInfantPlanUi ? (
              <div className="mt-4 pt-3 border-t border-border/15 space-y-2.5">
                <Button
                  size="sm"
                  className={`h-11 w-full flex items-center justify-center gap-2 rounded-xl bg-primary bg-gradient-to-b from-white/10 to-transparent hover:opacity-90 text-white border-0 transition-all duration-150 ${ctaGlow ? "shadow-[0_2px_4px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.2),0_0_0_3px_rgba(110,127,59,0.18)]" : "shadow-[0_2px_4px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.2)]"} active:translate-y-px active:shadow-[0_1px_2px_rgba(0,0,0,0.05)]`}
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
                        ...(selectedGoalForGeneratePlan ? { selected_goal: selectedGoalForGeneratePlan } : {}),
                      });
                      trackUsageEvent("plan_fill_day_success");
                      await queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                      const filled = result.filledSlotsCount ?? result.replacedCount ?? 0;
                      const total = result.totalSlots ?? 4;
                      if (result.partial || (result.ok !== false && (result.emptySlotsCount ?? 0) > 0)) {
                        showPartialFillToast(toast, navigate, { filled, total });
                      } else {
                        const planReadyT = toast({
                          title: "Меню на сегодня готово",
                          description: `Подобрано: ${filled} из ${total}`,
                        });
                        setTimeout(() => planReadyT.dismiss(), 2000);
                      }
                    } catch (e: unknown) {
                      trackUsageEvent("plan_fill_day_error", { properties: { message: e instanceof Error ? e.message : String(e) } });
                      const raw = e instanceof Error ? e.message : "Не удалось заполнить день";
                      const msg = planErrorMessage(raw, "Не удалось заполнить день");
                      if (msg === "LIMIT_REACHED") {
                        /* Paywall уже показан в usePlanGenerationJob, тост не показываем */
                      } else if (msg === "member_id_required") {
                        toast({ description: "Выберите профиль ребёнка вверху" });
                      } else if (msg.includes("слишком много времени")) {
                        showPartialFillToast(toast, navigate, {});
                      } else {
                        toast({ variant: "destructive", title: "Ошибка", description: msg });
                      }
                    } finally {
                      setPoolUpgradeLoading(false);
                    }
                  }}
                >
                  <Sparkles className="w-[18px] h-[18px] shrink-0" />
                  {isAnyGenerating ? "Собираем…" : "Собрать день"}
                </Button>
                <button
                  type="button"
                  disabled={!isFree && isAnyGenerating}
                  className={cn(
                    "w-full flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0 py-2 text-xs font-normal transition-colors",
                    "text-muted-foreground hover:text-foreground underline-offset-4 hover:underline",
                    "disabled:opacity-50 disabled:pointer-events-none disabled:no-underline",
                  )}
                  onClick={async () => {
                    if (isFree) {
                      if (FF_WEEK_PAYWALL_PREVIEW) {
                        setShowWeekPreviewSheet(true);
                      } else {
                        setPaywallCustomMessage("Заполнение недели доступно в Premium. Попробуйте Trial или оформите подписку.");
                        setShowPaywall(true);
                      }
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
                        ...(selectedGoalForGeneratePlan ? { selected_goal: selectedGoalForGeneratePlan } : {}),
                      });
                      setMutedWeekKeyAndStorage(null);
                      await queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                      const filled = result.filledSlotsCount ?? result.replacedCount ?? 0;
                      const total = result.totalSlots ?? 28;
                      if (result.partial || (result.ok !== false && (result.emptySlotsCount ?? 0) > 0)) {
                        showPartialFillToast(toast, navigate, { filled, total });
                      } else {
                        toast({ title: "Заполнить всю неделю", description: `Подобрано: ${filled} из ${total}` });
                      }
                    } catch (e: unknown) {
                      const raw = e instanceof Error ? e.message : "Не удалось заполнить неделю";
                      const msg = planErrorMessage(raw, "Не удалось заполнить неделю");
                      if (msg === "LIMIT_REACHED") {
                        /* Paywall уже показан в usePlanGenerationJob, тост не показываем */
                      } else if (msg === "member_id_required") {
                        toast({ description: "Выберите профиль ребёнка вверху" });
                      } else if (msg.includes("слишком много времени")) {
                        showPartialFillToast(toast, navigate, {});
                      } else {
                        toast({ variant: "destructive", title: "Ошибка", description: msg });
                      }
                    } finally {
                      setPoolUpgradeLoading(false);
                    }
                  }}
                >
                  {isFree ? (
                    <>
                      <span className="text-[13px] leading-none select-none" aria-hidden>
                        🔒
                      </span>
                      <span>Собрать неделю</span>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/75">Premium</span>
                    </>
                  ) : (
                    <span>Собрать неделю</span>
                  )}
                </button>
              </div>
            ) : null}
          </motion.div>

          {isInfantPlanUi && infantIntroducingBanner?.kind === "active" ? (
            <div className="mt-2 rounded-2xl border border-primary/20 bg-primary/[0.06] px-3.5 py-3 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug">
                    Продолжаем вводить: {infantIntroducingBanner.label} (день {infantIntroducingBanner.day})
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Пошаговое введение — 3 дня; затем окно наблюдения за реакцией (обычно 3–5 дней, как в «Помощь маме»).
                  </p>
                </div>
                <button
                  type="button"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground underline-offset-4 hover:underline shrink-0 min-h-[44px] px-2 -mx-2 text-left sm:text-right"
                  onClick={() => void clearIntroducingPeriod()}
                  disabled={isUpdatingMember}
                >
                  Завершить введение
                </button>
              </div>
            </div>
          ) : null}
          {isInfantPlanUi && infantIntroducingBanner?.kind === "grace" ? (
            <div className="mt-2 rounded-2xl border border-border/60 bg-muted/30 px-3.5 py-3 space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-foreground leading-snug">
                  Вы недавно начали вводить: {infantIntroducingBanner.label}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Обычно за реакцией наблюдают 3–5 дней.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Как малыш перенёс {infantIntroducingBanner.label}?
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="w-full rounded-xl"
                    disabled={isUpdatingMember}
                    onClick={() => void introducingReactionOk()}
                  >
                    Всё хорошо
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full rounded-xl border-border"
                    disabled={isUpdatingMember}
                    onClick={() => void introducingReactionDislike()}
                  >
                    Не понравилось
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full rounded-xl text-muted-foreground"
                    disabled={isUpdatingMember}
                    onClick={() => void introducingReactionIssue()}
                  >
                    Была реакция
                  </Button>
                </div>
              </div>
              <div className="border-t border-border/50 pt-3 space-y-2">
                <p className="text-xs text-muted-foreground">Или продолжите с тем же продуктом:</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full sm:flex-1 rounded-xl border-primary/30"
                    disabled={isUpdatingMember}
                    onClick={() => void continueIntroducingFromGrace()}
                  >
                    Продолжить с {infantIntroducingBanner.label}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full sm:flex-1 rounded-xl text-muted-foreground border-border"
                    disabled={isUpdatingMember}
                    onClick={() => void tryNewIntroducingProduct()}
                  >
                    Попробовать новый продукт
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {/* 2) Чипсы дней — только для плана 12+; в прикорме (&lt;12 мес) недельная лента скрыта */}
          {!isInfantPlanUi ? (
            <div
              className="flex gap-1 overflow-x-auto overflow-y-hidden pb-2 -mx-4 px-4 scrollbar-none min-w-0 max-w-full"
              style={{ scrollbarWidth: "none" }}
            >
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
                        if (FF_WEEK_PAYWALL_PREVIEW) {
                          setShowWeekPreviewSheet(true);
                        } else {
                          toast({
                            title: "Доступно в Premium",
                            description: "План на 7 дней — только для подписчиков.",
                          });
                        }
                        return;
                      }
                      setSelectedDay(index);
                    }}
                  />
                );
              })}
            </div>
          ) : null}

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
                  key={justCreatedMemberId ? "justCreated" : statusPhraseIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {justCreatedMemberId ? "Подбираем блюда для вашей семьи…" : GENERATION_STATUS_PHRASES[statusPhraseIndex]}
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

          {justCreatedMemberId && (isLoading || isFetching) && (
            <div className="flex items-center gap-3 mt-1 -mx-4 px-4">
              <div
                className="inline-flex items-center rounded-full py-2 px-3.5 text-typo-caption font-medium transition-colors"
                style={{
                  backgroundColor: "hsl(var(--primary) / 0.08)",
                  color: "hsl(var(--primary))",
                }}
                aria-live="polite"
              >
                Подбираем блюда для вашей семьи…
              </div>
            </div>
          )}

          {/* 3) Приёмы пищи: loader при загрузке/refetch, иначе empty state или слоты (единый источник: dayMealPlans) */}
          {isLoading || isFetching || (isInfantPlanUi && !isAdultNoRecipesEmpty && infantPoolListsLoading) ? (
            <div className={cn("mt-3 pb-4", isInfantPlanUi ? "space-y-3" : "space-y-4")}>
              {(isInfantPlanUi
                ? infantAgeBandU12 === "4_6"
                  ? [{ id: "sk1" }]
                  : [
                      { id: "sk1" },
                      { id: "sk2" },
                    ]
                : mealTypes
              ).map((slot) => (
                <MealCardSkeleton key={slot.id} />
              ))}
            </div>
          ) : showInfantPoolExhaustedFallback ? (
            <>
              <div className="mt-3 rounded-2xl border border-border/50 bg-primary/[0.04] p-3.5 space-y-2.5">
                <p className="text-sm text-foreground leading-relaxed text-pretty">
                  Пока нет подходящих вариантов для этого возраста.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
                  Попробуйте позже или откройте раздел «Помощь маме».
                </p>
                <Link
                  to="/sos"
                  className="text-sm font-medium text-primary/90 underline-offset-4 hover:underline hover:text-primary inline-flex min-h-[44px] items-center gap-1 py-0.5"
                >
                  Помощь маме
                </Link>
              </div>
            </>
          ) : isEmptyDay && !(isInfantPlanUi && !isAdultNoRecipesEmpty) ? (
            <>
              {isAdultNoRecipesEmpty ? (
                <TabEmptyState
                  className="mt-2"
                  icon={ClipboardList}
                  title="Недостаточно рецептов в пуле для этого профиля"
                  description="Добавьте рецепты для взрослых через Чат (например: «Подберите обед на понедельник») или Избранное."
                  primaryAction={{
                    label: "Сгенерировать в чате",
                    icon: Plus,
                    onClick: () =>
                      navigate("/chat", {
                        state: {
                          fromPlanSlot: true,
                          plannedDate: selectedDayKey,
                          mealType: firstEmptySlotId ?? "breakfast",
                          memberId: memberIdForPlan ?? undefined,
                          prefillMessage: getPlanSlotChatPrefillMessage(firstEmptySlotId ?? "breakfast"),
                          prefillOnly: true,
                        },
                      }),
                  }}
                />
              ) : !isInfantPlanUi ? (
                <TabEmptyState
                  className="mt-2"
                  icon={CalendarDays}
                  title="План на день пока пуст"
                  description="Соберите рацион на день или подберите блюда вручную"
                  previewLine="Завтрак • Обед • Ужин • Перекус"
                  primaryAction={{
                    label: "Собрать день",
                    icon: Sparkles,
                    disabled: isAnyGenerating || (isFree && todayIndex < 0),
                    onClick: async () => {
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
                          ...(selectedGoalForGeneratePlan ? { selected_goal: selectedGoalForGeneratePlan } : {}),
                        });
                        trackUsageEvent("plan_fill_day_success");
                        await queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                        const filled = result.filledSlotsCount ?? result.replacedCount ?? 0;
                        const total = result.totalSlots ?? 4;
                        if (result.partial || (result.ok !== false && (result.emptySlotsCount ?? 0) > 0)) {
                          showPartialFillToast(toast, navigate, { filled, total });
                        } else {
                          const planReadyT = toast({
                            title: "Меню на сегодня готово",
                            description: `Подобрано: ${filled} из ${total}`,
                          });
                          setTimeout(() => planReadyT.dismiss(), 2000);
                        }
                      } catch (e: unknown) {
                        trackUsageEvent("plan_fill_day_error", { properties: { message: e instanceof Error ? e.message : String(e) } });
                        const raw = e instanceof Error ? e.message : "Не удалось заполнить день";
                        const msg = planErrorMessage(raw, "Не удалось заполнить день");
                        if (msg === "LIMIT_REACHED") {
                          /* Paywall уже показан в usePlanGenerationJob, тост не показываем */
                        } else if (msg.includes("слишком много времени")) {
                          showPartialFillToast(toast, navigate, {});
                        } else {
                          toast({ variant: "destructive", title: "Ошибка", description: msg });
                        }
                      } finally {
                        setPoolUpgradeLoading(false);
                      }
                    },
                  }}
                  secondaryAction={{
                    label: "Подобрать рецепт",
                    variant: "outline",
                    onClick: () =>
                      navigate("/chat", {
                        state: {
                          fromPlanSlot: true,
                          plannedDate: selectedDayKey,
                          mealType: firstEmptySlotId ?? "breakfast",
                          memberId: memberIdForPlan ?? undefined,
                          prefillMessage: getPlanSlotChatPrefillMessage(firstEmptySlotId ?? "breakfast"),
                          prefillOnly: true,
                        },
                      }),
                  }}
                />
              ) : null}
            </>
          ) : (
            <>
            <div className={cn("mt-3 pb-4", isInfantPlanUi ? "space-y-3" : "space-y-4")}>
              {planSlotsForRender.map((slot) => {
                const infantSlotSectionHeading =
                  isInfantPlanUi && "sectionHeading" in slot && typeof slot.sectionHeading === "string"
                    ? slot.sectionHeading
                    : null;
                const plannedMeal = mealsByType[slot.id];
                const recipe = plannedMeal ? getPlannedMealRecipe(plannedMeal) : null;
                const recipeId = plannedMeal ? getPlannedMealRecipeId(plannedMeal) : null;
                const hasDish = !!(plannedMeal && recipeId && recipe?.title);
                const isPrimaryEmpty = !hasDish && firstEmptySlotId === slot.id;
                const infantPrimarySummaryLine =
                  isInfantPlanUi && isInfantNewRecipePlanSlot(slot.id) && recipeId
                    ? getInfantPrimaryProductSummaryLine(
                        previews[recipeId]?.ingredientNames,
                        introducedProductKeys
                      )
                    : null;
                const novelKeysForIntroduce =
                  isInfantPlanUi && isInfantNewRecipePlanSlot(slot.id) && recipeId && recipe?.title
                    ? getInfantNovelProductKeysForIntroduce(
                        previews[recipeId]?.ingredientNames,
                        recipe.title,
                        introducedProductKeys
                      )
                    : [];
                return (
                  <div key={slot.id} className={cn(infantSlotSectionHeading && "space-y-1")}>
                    {infantSlotSectionHeading ? (
                      <div className="px-0.5 space-y-0.5">
                        <p className="text-xs font-semibold text-foreground/90 tracking-tight">
                          {infantSlotSectionHeading}
                        </p>
                        {infantPrimarySummaryLine ? (
                          <p className="text-[11px] font-normal text-muted-foreground leading-snug">
                            {infantPrimarySummaryLine}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {hasDish ? (
                      <>
                      <MealCard
                        mealType={plannedMeal!.meal_type}
                        recipeTitle={recipe!.title}
                        recipeId={recipeId!}
                        mealTypeLabel={
                          !isInfantPlanUi || infantSlotSectionHeading ? slot.label : undefined
                        }
                        infantIntroducingLines={undefined}
                        plannedDate={selectedDayKey}
                        planMemberId={mealPlanMemberId ?? null}
                        infantPlanUi={isInfantPlanUi}
                        compact
                        isLoadingPreviews={isLoadingPreviews}
                        cookTimeMinutes={previews[recipeId!]?.cookTimeMinutes}
                        ingredientNames={previews[recipeId!]?.ingredientNames}
                        ingredientTotalCount={previews[recipeId!]?.ingredientTotalCount}
                        calories={previews[recipeId!]?.calories}
                        proteins={previews[recipeId!]?.proteins}
                        fats={previews[recipeId!]?.fats}
                        carbs={previews[recipeId!]?.carbs}
                        nutritionGoals={isInfantPlanUi ? [] : (previews[recipeId!]?.nutrition_goals ?? [])}
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
                          const slotKey = getSlotDayKey(selectedDayKey, slot.id);
                          if (isInfantPremiumAutoreplace && recipeId && recipe?.title) {
                            appendInfantMatchedVariant({
                              dayKey: selectedDayKey,
                              mealType: slot.id,
                              recipeId,
                              title: recipe.title,
                            });
                          }
                          if (replacingSlotKey != null) return;
                          if ((poolAutoReplaceCountBySlot[slotKey] ?? 0) >= slotAutoReplaceLimit) {
                            await clearSlotAndOpenPoolFallback({
                              dayKey: selectedDayKey,
                              mealType: slot.id,
                              planSlotId: plannedMeal.id,
                              infantReason: isInfantPremiumAutoreplace ? "limit_reached" : undefined,
                              skipClear: isInfantPremiumAutoreplace,
                            });
                            return;
                          }
                          setReplacingSlotKey(slotKey);
                          try {
                            if (
                              isInfantPremiumAutoreplace &&
                              infantPoolMemberData &&
                              user?.id &&
                              mealPlanMemberId
                            ) {
                              const picked = isInfantNewRecipePlanSlot(slot.id)
                                ? await pickInfantNewRecipe({
                                    supabase,
                                    userId: user.id,
                                    memberId: mealPlanMemberId,
                                    memberData: infantPoolMemberData,
                                    excludeRecipeIds: infantDayReplaceExcludeRecipeIdsMerged,
                                    excludeTitleKeys: infantDayReplaceExcludeTitleKeysMerged,
                                    limitCandidates: 150,
                                  })
                                : await pickInfantFamiliarRecipe({
                                    supabase,
                                    userId: user.id,
                                    memberId: mealPlanMemberId,
                                    memberData: infantPoolMemberData,
                                    excludeRecipeIds: infantDayReplaceExcludeRecipeIdsMerged,
                                    excludeTitleKeys: infantDayReplaceExcludeTitleKeysMerged,
                                    limitCandidates: 150,
                                  });
                              if (!picked) {
                                await clearSlotAndOpenPoolFallback({
                                  dayKey: selectedDayKey,
                                  mealType: slot.id,
                                  planSlotId: plannedMeal.id,
                                  infantReason: "candidates_exhausted",
                                  skipClear: true,
                                });
                                return;
                              }
                              if (picked.id === recipeId) {
                                toast({ description: "Нет других вариантов" });
                                return;
                              }
                              const introKey =
                                (selectedMember as MembersRow | undefined)?.introducing_product_key?.trim() ?? null;
                              if (
                                isInfantNewRecipePlanSlot(slot.id) &&
                                introKey &&
                                picked.firstNovelProductKey &&
                                picked.firstNovelProductKey !== introKey
                              ) {
                                setInfantReplacePrimaryConfirm({
                                  currentLabel: getProductDisplayLabel(introKey),
                                  newLabel: getProductDisplayLabel(picked.firstNovelProductKey),
                                  picked: {
                                    id: picked.id,
                                    title: picked.title,
                                    firstNovelProductKey: picked.firstNovelProductKey,
                                  },
                                  slotId: slot.id,
                                });
                                return;
                              }
                              await replaceSlotWithRecipe(
                                {
                                  dayKey: selectedDayKey,
                                  mealType: slot.id,
                                  recipeId: picked.id,
                                  recipeTitle: picked.title,
                                },
                                { skipInvalidate: true }
                              );
                              setSessionExcludeRecipeIds((prev) => ({
                                ...prev,
                                [selectedDayKey]: [...(prev[selectedDayKey] ?? []), picked.id],
                              }));
                              setSessionExcludeTitleKeys((prev) => ({
                                ...prev,
                                [selectedDayKey]: [...(prev[selectedDayKey] ?? []), normalizeTitleKey(picked.title)],
                              }));
                              applyReplaceSlotToPlanCache(
                                queryClient,
                                { mealPlansKeyWeek, mealPlansKeyDay },
                                {
                                  dayKey: selectedDayKey,
                                  mealType: slot.id,
                                  newRecipeId: picked.id,
                                  title: picked.title,
                                  plan_source: "pool",
                                },
                                mealPlanMemberId ?? null
                              );
                              setPoolAutoReplaceCountBySlot((prev) => ({
                                ...prev,
                                [slotKey]: (prev[slotKey] ?? 0) + 1,
                              }));
                              appendInfantMatchedVariant({
                                dayKey: selectedDayKey,
                                mealType: slot.id,
                                recipeId: picked.id,
                                title: picked.title,
                              });
                              toast({ description: "Блюдо заменено" });
                              if (isPlanDebug()) {
                                console.info("[replace_slot]", {
                                  requestId: undefined,
                                  dayKey: selectedDayKey,
                                  memberId: mealPlanMemberId,
                                  slot: slot.id,
                                  ok: true,
                                  reason: "client_pool_infant",
                                });
                              }
                              return;
                            }

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
                              if (result.pickedSource === "pool" || result.plan_source === "pool") {
                                setPoolAutoReplaceCountBySlot((prev) => ({
                                  ...prev,
                                  [slotKey]: (prev[slotKey] ?? 0) + 1,
                                }));
                              }
                              if (isInfantPremiumAutoreplace) {
                                appendInfantMatchedVariant({
                                  dayKey: selectedDayKey,
                                  mealType: slot.id,
                                  recipeId: result.newRecipeId,
                                  title: result.title,
                                });
                              }
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
                                await clearSlotAndOpenPoolFallback({
                                  dayKey: selectedDayKey,
                                  mealType: slot.id,
                                  planSlotId: plannedMeal.id,
                                  infantReason: isInfantPremiumAutoreplace ? "candidates_exhausted" : undefined,
                                  skipClear: isInfantPremiumAutoreplace,
                                });
                              } else {
                                const err = "error" in result ? result.error : "";
                                if (err === "limit") {
                                  toast({
                                    variant: "destructive",
                                    title: "Лимит",
                                    description: "2 замены в день (Free). В Premium — без ограничений.",
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
                          const sk = `${selectedDayKey}_${slot.id}`;
                          try {
                            await deleteMealPlan(planSlotId);
                            setPoolAutoReplaceCountBySlot((prev) => {
                              if (prev[sk] == null) return prev;
                              const next = { ...prev };
                              delete next[sk];
                              return next;
                            });
                            queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                            toast({ title: "Блюдо удалено", description: "Убрано из плана на день" });
                          } catch (e: unknown) {
                            toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : "Не удалось удалить" });
                          }
                        } : undefined}
                      />
                      {isInfantPlanUi &&
                      selectedMember?.id &&
                      (selectedMember.type ?? "child") !== "family" &&
                      novelKeysForIntroduce.length > 0 ? (
                        <div className="mt-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 w-full rounded-xl border-primary/25 text-xs font-medium text-foreground hover:bg-primary/[0.06]"
                            disabled={isUpdatingMember}
                            onClick={() => {
                              void addIntroducedFromRecipe({
                                ingredientNames: previews[recipeId!]?.ingredientNames,
                                recipeTitle: recipe!.title,
                              });
                            }}
                          >
                            {`Ввести ${getProductDisplayLabel(novelKeysForIntroduce[0])} →`}
                          </Button>
                        </div>
                      ) : null}
                      </>
                    ) : isLoading || isAnyGenerating || replacingSlotKey === `${selectedDayKey}_${slot.id}` ? (
                      <MealCardSkeleton />
                    ) : (
                      <div
                        className={cn(
                          recipeCard,
                          "flex flex-col items-start justify-center gap-3 px-3 pt-3 pb-4 min-h-[88px] touch-manipulation",
                          isPrimaryEmpty
                            ? "bg-primary/[0.06]"
                            : "bg-muted/50 border-border/60 shadow-none"
                        )}
                      >
                        <span
                          className={cn(
                            recipeMealBadge,
                            !isPrimaryEmpty && "opacity-90"
                          )}
                        >
                          {slot.label}
                        </span>
                        {isInfantPlanUi ? (
                          <p className="text-sm text-foreground/90 leading-relaxed flex items-start gap-2.5 pr-1">
                            <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin text-primary/60" aria-hidden />
                            <span>Мы подбираем подходящий вариант прикорма…</span>
                          </p>
                        ) : (
                          <p
                            className={cn(
                              "text-sm font-semibold leading-snug",
                              isPrimaryEmpty ? "text-foreground" : "text-muted-foreground"
                            )}
                          >
                            Блюдо не выбрано
                          </p>
                        )}
                        {!isAnyGenerating && !isInfantPlanUi && (
                          <button
                            type="button"
                            className={cn(
                              "text-sm font-medium underline underline-offset-2 text-left w-fit min-h-[44px] py-1 -my-1 transition-colors active:scale-95",
                              isPrimaryEmpty
                                ? "text-primary hover:text-primary/80 active:text-primary/70"
                                : "text-primary/75 hover:text-primary active:text-primary/85"
                            )}
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
                                    description: "Блюдо добавлено в план",
                                    duration: 2500,
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
                                    await clearSlotAndOpenPoolFallback({
                                      dayKey: selectedDayKey,
                                      mealType: slot.id,
                                      planSlotId: null,
                                    });
                                  } else {
                                    const err = "error" in result ? result.error : "";
                                    if (err === "limit") {
                                      toast({
                                        variant: "destructive",
                                        title: "Лимит",
                                        description: "2 замены в день (Free). В Premium — без ограничений.",
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
            {/* Зона под блюдами: заметная CTA + запас снизу, чтобы не сливаться с таббаром (прикорм — только нижний отступ) */}
            <div
              className={cn(
                "space-y-3",
                isInfantPlanUi
                  ? "mt-2 pb-[calc(4rem+env(safe-area-inset-bottom,0px))]"
                  : "mt-3 pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))]",
              )}
            >
              {!isInfantPlanUi ? (
              <motion.div
                className="w-full"
                whileTap={isAnyGenerating || !user ? undefined : { scale: 0.97 }}
                transition={{ type: "spring", stiffness: 520, damping: 28 }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border-2 border-primary bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary text-[13px] font-semibold shadow-sm"
                  disabled={isAnyGenerating || !user}
                  onClick={() => {
                    if (!hasAccess) {
                      setPaywallCustomMessage("Список продуктов доступен в Premium");
                      setShowPaywall(true);
                      return;
                    }
                    setShoppingBuildSheetOpen(true);
                  }}
                >
                  <ShoppingCart className="w-[18px] h-[18px] shrink-0" aria-hidden />
                  Собрать список продуктов
                </Button>
              </motion.div>
              ) : null}
              {!isInfantPlanUi && dayHasShareableMeals && (
                <div className="flex flex-col items-stretch gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="w-full h-10 flex items-center justify-center gap-2 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 shadow-none border-0"
                    onClick={() => openShareDayPreview()}
                    disabled={isAnyGenerating || !user}
                  >
                    <ShareIosIcon className="w-4 h-4 shrink-0 opacity-80" aria-hidden />
                    Отправить меню
                  </Button>
                  <p className="text-[10px] text-center text-muted-foreground">Покажите близким или сохраните себе</p>
                </div>
              )}
            {/* Карточка «Спросить в чате» — только Free, план уже сгенерирован */}
            {!isInfantPlanUi && isFree && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-[0_1px_4px_-2px_rgba(0,0,0,0.04)]"
              >
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  Не нашли подходящее блюдо?
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Опишите, что хотите приготовить — подберём рецепт в чате.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl border-primary-border/70 text-primary hover:bg-primary/10 text-xs font-medium"
                  onClick={() => navigate("/chat")}
                >
                  Спросить в чате
                </Button>
              </motion.div>
            )}
            </div>
            </>
          )}

          {hasAnyWeekPlan &&
            missingDayKeys.length === 1 &&
            missingDayKeys[0] === endKey &&
            !isFree &&
            !isInfantPlanUi &&
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
                        ...(selectedGoalForGeneratePlan ? { selected_goal: selectedGoalForGeneratePlan } : {}),
                      });
                      queryClient.invalidateQueries({ queryKey: ["meal_plans_v2", user?.id] });
                      const filled = result.filledSlotsCount ?? result.replacedCount ?? 0;
                      const total = result.totalSlots ?? 4;
                      if (result.partial || (result.ok !== false && (result.emptySlotsCount ?? 0) > 0)) {
                        showPartialFillToast(toast, navigate, { filled, total });
                      } else {
                        const aiFallback = result.aiFallbackCount ?? 0;
                        const desc = aiFallback > 0
                          ? `Подобрано из базы: ${result.replacedCount ?? 0}, добавлено AI: ${aiFallback}`
                          : `Подобрано: ${filled} из ${total}`;
                        toast({ title: "Подобрать рецепты", description: desc });
                      }
                    } catch (e: unknown) {
                      const raw = e instanceof Error ? e.message : "Не удалось подобрать рецепты";
                      const msg = planErrorMessage(raw, "Не удалось подобрать рецепты");
                      if (msg === "LIMIT_REACHED") {
                        /* Paywall уже показан в usePlanGenerationJob, тост не показываем */
                      } else if (msg === "member_id_required") {
                        toast({ description: "Выберите профиль ребёнка вверху" });
                      } else if (msg.includes("слишком много времени")) {
                        showPartialFillToast(toast, navigate, {});
                      } else {
                        toast({ variant: "destructive", title: "Ошибка", description: msg });
                      }
                    } finally {
                      setPoolUpgradeLoading(false);
                    }
                  }}
                >
                  Собрать день
                </Button>
              </div>
            )}
        </div>
      </div>

      {FF_WEEK_PAYWALL_PREVIEW && (
        <WeekPreviewPaywallSheet
          open={showWeekPreviewSheet}
          onOpenChange={setShowWeekPreviewSheet}
          previewDayLabel={weekPreviewData.previewDayLabel}
          previewMeals={weekPreviewData.previewMeals}
        />
      )}

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
        infantMode={Boolean(poolExhaustedContext?.infantReason) && isInfantPlanUi}
        infantReason={poolExhaustedContext?.infantReason}
        infantMatchedOptions={Boolean(poolExhaustedContext?.infantReason) ? infantPoolExhaustedOptions : []}
        onSelectInfantOption={async (option) => {
          if (!poolExhaustedContext) return;
          try {
            await replaceSlotWithRecipe(
              {
                dayKey: poolExhaustedContext.dayKey,
                mealType: poolExhaustedContext.mealType,
                recipeId: option.recipeId,
                recipeTitle: option.title,
              },
              { skipInvalidate: true }
            );
            applyReplaceSlotToPlanCache(
              queryClient,
              { mealPlansKeyWeek, mealPlansKeyDay },
              {
                dayKey: poolExhaustedContext.dayKey,
                mealType: poolExhaustedContext.mealType,
                newRecipeId: option.recipeId,
                title: option.title,
                plan_source: "pool",
              },
              mealPlanMemberId ?? null
            );
            toast({ description: "Вариант возвращён в план" });
          } catch (e: unknown) {
            toast({
              variant: "destructive",
              title: "Ошибка",
              description: e instanceof Error ? e.message : "Не удалось вернуть вариант",
            });
          }
        }}
      />

      <BuildShoppingListFromPlanSheet
        open={shoppingBuildSheetOpen}
        onOpenChange={setShoppingBuildSheetOpen}
        planMemberId={memberIdForPlan}
        hasAccess={hasAccess}
        navigateToShoppingTabOnSuccess
      />

      <Sheet open={planProfileHelpOpen} onOpenChange={setPlanProfileHelpOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[88vh] overflow-y-auto pt-6 pb-8">
          <SheetHeader className="text-left pr-8">
            <SheetTitle>Профиль и меню</SheetTitle>
          </SheetHeader>
          {members.length > 0 && memberDataForPlan ? (
            <PlanProfileHelpBody
              className="mt-4"
              mode={isFamilySelected(selectedMemberId, members) ? "family" : "member"}
              memberAgeMonths={"age_months" in memberDataForPlan ? memberDataForPlan.age_months : undefined}
              memberAllergies={memberDataForPlan.allergies}
              memberLikes={"likes" in memberDataForPlan ? memberDataForPlan.likes : undefined}
              memberDislikes={memberDataForPlan.dislikes}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={introducedProductsDialogOpen} onOpenChange={setIntroducedProductsDialogOpen}>
        <DialogContent className="max-w-[min(100vw-1.5rem,28rem)] p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle>Уже введённые продукты</DialogTitle>
          </DialogHeader>
          <TagListEditor
            id="meal-plan-introduced-products"
            items={introducedProductKeys.map((key) => getProductDisplayLabel(key))}
            inputValue={introducedProductsInput}
            onInputChange={setIntroducedProductsInput}
            onAdd={(raw) => {
              const parsed = parseTags(raw);
              if (!parsed.length) return;
              const normalized = normalizeProductKeys(parsed);
              if (normalized.length === 0) {
                toast({
                  description:
                    "Не удалось распознать продукт по этому названию. Попробуйте другое слово (например: кабачок, яблоко) или введите на латинице.",
                });
                setIntroducedProductsInput("");
                return;
              }
              void saveIntroducedProductKeys(Array.from(new Set([...introducedProductKeys, ...normalized]))).catch(() => {});
              setIntroducedProductsInput("");
            }}
            onEdit={(value, index) => {
              setIntroducedProductsInput(value);
              const current = introducedProductKeys[index];
              void saveIntroducedProductKeys(introducedProductKeys.filter((key) => key !== current)).catch(() => {});
            }}
            onRemove={(index) => {
              const current = introducedProductKeys[index];
              void saveIntroducedProductKeys(introducedProductKeys.filter((key) => key !== current)).catch(() => {});
            }}
            placeholder="Например: кабачок, яблоко"
          />
          <p className="text-xs text-muted-foreground">
            Это необязательно. Если список пустой, подбор прикорма работает как раньше.
          </p>
        </DialogContent>
      </Dialog>

      <Dialog
        open={shareMenuPreview != null}
        onOpenChange={(open) => {
          if (!open && !shareMenuSending) setShareMenuPreview(null);
        }}
      >
        <DialogContent className="max-w-[min(100vw-1.5rem,28rem)] p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle>Ваше меню</DialogTitle>
          </DialogHeader>
          <pre className="text-sm text-foreground whitespace-pre-wrap font-sans max-h-[min(50vh,18rem)] overflow-y-auto rounded-lg bg-muted/40 p-3 border border-border/50">
            {shareMenuPreviewBody}
          </pre>
          <DialogFooter>
            <Button
              type="button"
              className="w-full rounded-xl inline-flex items-center justify-center gap-2"
              disabled={shareMenuSending}
              onClick={() => void confirmShareMenuPreview()}
            >
              {shareMenuSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                  Отправляем…
                </>
              ) : (
                "Отправить"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionModal
        open={introduceConflictOpen}
        onOpenChange={(open) => {
          setIntroduceConflictOpen(open);
          if (!open) setIntroduceConflictPayload(null);
        }}
        title="Новый продукт?"
        description={
          selectedMember && (selectedMember as MembersRow).introducing_product_key
            ? `Сейчас вы вводите ${getProductDisplayLabel((selectedMember as MembersRow).introducing_product_key!)} (день ${getIntroducingDisplayDay((selectedMember as MembersRow).introducing_started_at!, new Date()) ?? "?"}). Лучше завершить введение перед новым продуктом.`
            : ""
        }
        confirmText="Всё равно добавить"
        cancelText="Продолжить"
        onConfirm={async () => {
          const p = introduceConflictPayload;
          if (p) {
            await addIntroducedFromRecipe({
              ingredientNames: p.ingredientNames,
              recipeTitle: p.recipeTitle,
              forceSwitchProduct: true,
            });
          }
        }}
      />

      <ConfirmActionModal
        open={infantReplacePrimaryConfirm != null}
        onOpenChange={(open) => {
          if (!open) setInfantReplacePrimaryConfirm(null);
        }}
        title="Заменить продукт введения?"
        description={
          infantReplacePrimaryConfirm
            ? `Вы уже начали вводить ${infantReplacePrimaryConfirm.currentLabel}. Заменить на ${infantReplacePrimaryConfirm.newLabel}?`
            : ""
        }
        confirmText="Да"
        cancelText="Нет"
        onConfirm={async () => {
          const p = infantReplacePrimaryConfirm;
          if (!p || !selectedMember?.id || !user?.id || !mealPlanMemberId) return;
          const slotKey = getSlotDayKey(selectedDayKey, p.slotId);
          try {
            await updateMember({
              id: selectedMember.id,
              introducing_product_key: null,
              introducing_started_at: null,
            });
            await queryClient.invalidateQueries({ queryKey: ["members", user?.id] });
            await replaceSlotWithRecipe(
              {
                dayKey: selectedDayKey,
                mealType: p.slotId,
                recipeId: p.picked.id,
                recipeTitle: p.picked.title,
              },
              { skipInvalidate: true }
            );
            setSessionExcludeRecipeIds((prev) => ({
              ...prev,
              [selectedDayKey]: [...(prev[selectedDayKey] ?? []), p.picked.id],
            }));
            setSessionExcludeTitleKeys((prev) => ({
              ...prev,
              [selectedDayKey]: [...(prev[selectedDayKey] ?? []), normalizeTitleKey(p.picked.title)],
            }));
            applyReplaceSlotToPlanCache(
              queryClient,
              { mealPlansKeyWeek, mealPlansKeyDay },
              {
                dayKey: selectedDayKey,
                mealType: p.slotId,
                newRecipeId: p.picked.id,
                title: p.picked.title,
                plan_source: "pool",
              },
              mealPlanMemberId ?? null
            );
            setPoolAutoReplaceCountBySlot((prev) => ({
              ...prev,
              [slotKey]: (prev[slotKey] ?? 0) + 1,
            }));
            appendInfantMatchedVariant({
              dayKey: selectedDayKey,
              mealType: p.slotId,
              recipeId: p.picked.id,
              title: p.picked.title,
            });
            toast({ description: "Блюдо заменено" });
          } catch (e: unknown) {
            toast({
              variant: "destructive",
              title: "Ошибка",
              description: e instanceof Error ? e.message : "Не удалось заменить",
            });
          }
        }}
      />

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
