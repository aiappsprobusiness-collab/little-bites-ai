import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { ArrowLeft, Heart, CalendarPlus, Pencil, Trash2, ThumbsUp, ThumbsDown, ShoppingCart } from "lucide-react";
import { useRecipes } from "@/hooks/useRecipes";
import { useFavorites } from "@/hooks/useFavorites";
import { useMealPlans } from "@/hooks/useMealPlans";
import { useMyRecipes } from "@/hooks/useMyRecipes";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import type { IngredientItem, RecipeDisplayIngredients } from "@/types/recipe";
import { scaleIngredientDisplay } from "@/types/recipe";
import { applyIngredientOverrides, ingredientKey } from "@/types/ingredientOverrides";
import { buildRecipeShareTextShort, SHARE_APP_URL } from "@/utils/shareRecipeText";
import {
  trackUsageEvent,
  generateShareRef,
  getShareChannelFromContext,
  getShortShareUrl,
  saveShareRef,
  getShareRecipeUrl,
  trackShareLinkCreated,
} from "@/utils/usageEvents";
import { supabase } from "@/integrations/supabase/client";
import { AddToPlanSheet } from "@/components/plan/AddToPlanSheet";
import { MyRecipeFormSheet } from "@/components/favorites/MyRecipeFormSheet";
import { useFamily } from "@/contexts/FamilyContext";
import { useAppStore } from "@/store/useAppStore";
import { getBenefitLabel } from "@/utils/ageCategory";
import {
  buildRecipeBenefitDescription,
} from "@/utils/recipeBenefitDescription";
import { getMealLabel } from "@/data/mealLabels";
import { recipeHeroCard } from "@/theme/recipeTokens";
import type { IngredientOverrides } from "@/components/recipe/IngredientChips";
import { RecipeIngredientList } from "@/components/recipe/RecipeIngredientList";
import { ChefAdviceCard } from "@/components/recipe/ChefAdviceCard";
import { RecipeSteps } from "@/components/recipe/RecipeSteps";
import { RecipeNutritionHeader } from "@/components/recipe/RecipeNutritionHeader";
import { NutritionGoalsChips } from "@/components/recipe/NutritionGoalsChips";
import { ShareIosIcon } from "@/components/icons/ShareIosIcon";
import { cn } from "@/lib/utils";
import { mealPlanMemberIdForShoppingSync } from "@/utils/mealPlanMemberScope";
import { useShoppingList } from "@/hooks/useShoppingList";
import { getChefAdviceCardPresentation, isInfantRecipe } from "@/utils/infantRecipe";
import {
  buildShoppingIngredientPayloadsFromRecipe,
  recipeRpcIngredientsToShoppingRows,
} from "@/utils/shopping/shoppingListMerge";
import { readMealPlanMutedWeekKeyFromStorage } from "@/hooks/useMealPlanMemberData";
import { mealPlanPathWithOptionalDate } from "@/utils/mealPlanNavigation";
import { markShoppingListEntranceStagger } from "@/utils/shopping/shoppingListEntrance";
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
import { Skeleton } from "@/components/ui/skeleton";

/** Привести рецепт к списку IngredientItem: приоритет ingredients_items, иначе нормализация ingredients. */
function getDisplayIngredients(recipe: RecipeDisplayIngredients): IngredientItem[] {
  const items = recipe.ingredients_items;
  if (Array.isArray(items) && items.length > 0) return items;

  const raw = recipe.ingredients;
  if (!Array.isArray(raw) || raw.length === 0) return [];

  return raw.map((item): IngredientItem => {
    if (typeof item === "string") return { name: item };
    const o = item as {
      name?: string;
      display_text?: string | null;
      canonical_amount?: number | null;
      canonical_unit?: string | null;
      amount?: number | null;
      unit?: string | null;
      note?: string;
      substitute?: string | null;
      display_amount?: number | null;
      display_unit?: string | null;
      display_quantity_text?: string | null;
      measurement_mode?: string | null;
      category?: string | null;
    };
    return {
      name: o.name ?? "",
      display_text: o.display_text ?? undefined,
      canonical_amount: o.canonical_amount ?? undefined,
      canonical_unit: (o.canonical_unit === "g" || o.canonical_unit === "ml" ? o.canonical_unit : undefined) as "g" | "ml" | undefined,
      amount: o.amount ?? undefined,
      unit: o.unit ?? undefined,
      note: o.note ?? undefined,
      substitute: o.substitute ?? undefined,
      display_amount: o.display_amount ?? undefined,
      display_unit: o.display_unit ?? undefined,
      display_quantity_text: o.display_quantity_text ?? undefined,
      measurement_mode: o.measurement_mode ?? undefined,
      category: o.category ?? undefined,
    };
  });
}

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { selectedMember, selectedMemberId, members } = useFamily();
  /** Совпадает с queryKey MealPlanPage — иначе план на дату грузится заново без кэша и слот/порции «прыгают». */
  const recipePlanMutedWeekKey = useMemo(() => readMealPlanMutedWeekKeyFromStorage(), []);
  const { hasAccess } = useSubscription();
  const { addRecipeIngredients, isAddingToList } = useShoppingList();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const setPaywallReason = useAppStore((s) => s.setPaywallReason);
  const isFree = !hasAccess;
  const [searchParams] = useSearchParams();
  const { getRecipeById } = useRecipes();
  const { data: recipe, isLoading, error } = getRecipeById(id || "");
  const state = location.state as {
    fromMealPlan?: boolean;
    fromFavorites?: boolean;
    fromChat?: boolean;
    preloadedTitle?: string;
    mealTypeLabel?: string;
    /** string — член семьи; null — план «Семья» (meal_plans_v2.member_id IS NULL) */
    memberId?: string | null;
    plannedDate?: string;
    mealType?: string;
  } | null;
  const preloadedTitle = state?.preloadedTitle?.trim() || null;
  const recipeTitle = (recipe as { title?: string } | undefined)?.title?.trim() || null;
  const headerTitle = preloadedTitle ?? recipeTitle ?? "Рецепт";
  const isInitialLoading = isLoading && !recipe && !error;

  useEffect(() => {
    if (import.meta.env.DEV && searchParams.get("debugIngredients") === "1" && id && recipe) {
      const raw = (recipe as { ingredients?: unknown[] }).ingredients;
      console.debug("[debugIngredients] recipe_id=", id, "recipe_title=", (recipe as { title?: string }).title, "recipe_ingredients (raw)=", raw);
    }
  }, [import.meta.env.DEV, searchParams, id, recipe]);

  // Вирусность: приход по share-ссылке (ep=share_recipe)
  useEffect(() => {
    if (!id) return;
    const ep = searchParams.get("ep");
    const sr = searchParams.get("sr");
    if (ep === "share_recipe" || sr) {
      trackUsageEvent("share_landing_view", { properties: { recipe_id: id } });
    }
  }, [id, searchParams]);

  /** SoT «открыл экран рецепта» в приложении: один раз на загрузку контента (dedup в trackUsageEvent). */
  useEffect(() => {
    if (!id || !recipe || error) return;
    const ep = searchParams.get("ep");
    const sr = searchParams.get("sr");
    let source: "plan" | "favorites" | "shared" | "welcome_demo" | "chat" | "other" = "other";
    if (state?.fromMealPlan) source = "plan";
    else if (state?.fromFavorites) source = "favorites";
    else if (state?.fromChat) source = "chat";
    else if (ep === "share_recipe" || sr) source = "shared";
    trackUsageEvent("recipe_view", {
      properties: {
        recipe_id: id,
        source,
        is_public: false,
      },
    });
  }, [id, recipe, error, state?.fromMealPlan, state?.fromFavorites, state?.fromChat, searchParams]);
  const fromMealPlan = state?.fromMealPlan;
  const fromFavorites = state?.fromFavorites;
  const mealTypeLabel = state?.mealTypeLabel;
  const stateMemberId = state?.memberId ?? null;
  const plannedDate = state?.plannedDate ?? null;
  const planMealType = state?.mealType ?? null;
  const mealPlanReturnPath = mealPlanPathWithOptionalDate(plannedDate);
  const favoriteMemberId = stateMemberId ?? (selectedMemberId && selectedMemberId !== "family" ? selectedMemberId : null);

  /**
   * member_id строки meal_plans_v2 для слота.
   * Явный `memberId: null` в state = семейная строка плана; `!= null` нельзя — null терялся бы и слот не находился.
   */
  const hasExplicitPlanMemberId = Boolean(
    state && fromMealPlan && plannedDate && planMealType && Object.prototype.hasOwnProperty.call(state, "memberId")
  );
  const planRowMemberId =
    fromMealPlan && plannedDate && planMealType
      ? hasExplicitPlanMemberId
        ? state!.memberId ?? null
        : mealPlanMemberIdForShoppingSync({ hasAccess, selectedMemberId, members })
      : undefined;
  /** Free «Семья» до загрузки members: scope как на MealPlanPage — undefined, запрос плана выключен. */
  const planMemberScopePending = Boolean(
    fromMealPlan && plannedDate && planMealType && !hasExplicitPlanMemberId && planRowMemberId === undefined
  );
  const planDate = fromMealPlan && plannedDate ? new Date(plannedDate + "T12:00:00") : new Date();
  const mealPlansApi = useMealPlans(planRowMemberId, { mutedWeekKey: recipePlanMutedWeekKey });
  const { data: dayPlans, isLoading: dayPlanLoading } = mealPlansApi.getMealPlansByDate(planDate);
  const dayPlanBlocked = dayPlanLoading || planMemberScopePending;
  const planSlot =
    fromMealPlan && plannedDate && planMealType && id
      ? dayPlans?.find(
          (p) =>
            p.planned_date === plannedDate && p.meal_type === planMealType && p.recipe_id === id
        )
      : null;
  /** Слот реально есть в загруженном плане — иначе нельзя подставлять servings_recommended и тем более писать в БД (было 4↔1). */
  const planSlotResolved = planSlot != null;
  const slotOverrides = planSlot?.ingredient_overrides ?? [];
  const slotServings = planSlot?.servings;

  const { updateSlotServings } = mealPlansApi;

  const { isFavorite: isFavoriteFn, toggleFavorite } = useFavorites("all");
  const isFavorite = !!id && isFavoriteFn(id, favoriteMemberId);
  const { deleteUserRecipe, isDeleting } = useMyRecipes();
  const [addToPlanOpen, setAddToPlanOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userVote, setUserVote] = useState<"like" | "dislike" | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase.rpc as any)("get_recipe_my_vote", { p_recipe_id: id });
        if (cancelled) return;
        if (data === "like") setUserVote("like");
        else if (data === "dislike") setUserVote("dislike");
        else setUserVote(null);
      } catch {
        if (!cancelled) setUserVote(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleRecipeFeedback = async (action: "like" | "dislike") => {
    if (!id) return;
    if (userVote === action) return; /* повторный тот же голос — no-op, без API и toast */
    try {
      await (supabase.rpc as any)("record_recipe_feedback", { p_recipe_id: id, p_action: action });
      setUserVote(action);
      toast({ title: action === "like" ? "Спасибо за отзыв" : "Учли" });
    } catch {
      toast({ variant: "destructive", title: "Не удалось отправить" });
    }
  };

  const handleToggleFavorite = async () => {
    if (!id || !recipe) return;
    try {
      await toggleFavorite({
        recipeId: id,
        memberId: favoriteMemberId,
        isFavorite: !isFavorite,
        recipeData: {
          title: (recipe as { title?: string }).title,
          description: (recipe as { description?: string }).description,
          cookTimeMinutes: (recipe as { cooking_time_minutes?: number }).cooking_time_minutes,
          ingredientNames: Array.isArray((recipe as { ingredients?: unknown[] }).ingredients)
            ? (recipe as { ingredients: { name?: string }[] }).ingredients.map((i) => i.name ?? "").filter(Boolean)
            : [],
          chefAdvice: (recipe as { chefAdvice?: string }).chefAdvice ?? (recipe as { chef_advice?: string }).chef_advice,
          advice: (recipe as { advice?: string }).advice,
        },
      });
      toast({ title: isFavorite ? "Удалено из избранного" : "Добавлено в избранное" });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error)?.message ?? "Не удалось обновить избранное" });
    }
  };
  const handleShare = async () => {
    if (!id || !recipe) return;
    const shareRef = generateShareRef();
    const usedNativeShare = typeof navigator !== "undefined" && !!navigator.share;
    const channel = getShareChannelFromContext(usedNativeShare, false);
    const saved = await saveShareRef(id, shareRef);
    if (saved) {
      trackShareLinkCreated({
        share_type: "recipe",
        share_ref: shareRef,
        surface: "recipe_page",
        recipe_id: id,
        has_native_share: usedNativeShare,
      });
    }
    const shareUrl = saved
      ? getShortShareUrl(shareRef, SHARE_APP_URL)
      : getShareRecipeUrl(id, channel, shareRef, SHARE_APP_URL);
    trackUsageEvent("share_click", {
      properties: {
        recipe_id: id,
        share_ref: shareRef,
        channel,
        source_screen: "recipe_page",
      },
    });
    const recipeDisplay = recipe as RecipeDisplayIngredients & { title?: string };
    const shareText = buildRecipeShareTextShort(recipeDisplay.title ?? "Рецепт", shareUrl);
    let shareCompleted = false;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: recipeDisplay.title ?? "Рецепт",
          text: shareText,
        });
        toast({ title: "Рецепт отправлен" });
        shareCompleted = true;
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        toast({ title: "Рецепт скопирован" });
        shareCompleted = true;
      } else {
        toast({ variant: "destructive", title: "Поделиться недоступно" });
      }
    } catch (e: unknown) {
      if ((e as Error)?.name !== "AbortError") {
        toast({ variant: "destructive", title: "Ошибка", description: (e as Error)?.message ?? "Не удалось поделиться" });
      }
    }
    if (shareCompleted) {
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (sess?.session?.user?.id) {
          await supabase.rpc("record_recipe_feedback", { p_recipe_id: id, p_action: "shared" });
        }
      } catch {
        /* сигнал scoring не критичен для UX */
      }
    }
  };

  const [overrides, setOverrides] = useState<IngredientOverrides>({});
  const [servingsSelected, setServingsSelected] = useState(1);
  /** Ручной степпер ±: не перетирать servings из эффектов и повторных fetch. */
  const userHasChangedServingsRef = useRef(false);
  /**
   * Один раз на «экран» (ключ навигации): после гидрации не подставлять снова base/recommended из recipe
   * и не сбрасывать порции при refetch React Query — иначе 4↔1 и цикл пересчёта ингредиентов.
   */
  const servingsHydratedViewKeyRef = useRef<string | null>(null);

  /** Ключ вида карточки: избранное / каталог / слот плана — смена сбрасывает гидрацию в отдельном эффекте. */
  const servingsViewKey = useMemo(() => {
    if (!id) return "";
    if (fromFavorites) return `fav:${id}`;
    if (fromMealPlan) {
      if (!plannedDate || !planMealType) return "";
      return `plan:${plannedDate}:${planMealType}:${planRowMemberId ?? "fam"}:${id}`;
    }
    return `cat:${id}`;
  }, [id, fromFavorites, fromMealPlan, plannedDate, planMealType, planRowMemberId]);

  useEffect(() => {
    if (!servingsViewKey) return;
    userHasChangedServingsRef.current = false;
    servingsHydratedViewKeyRef.current = null;
  }, [servingsViewKey]);

  /** Актуальные значения для cleanup при unmount (избегаем stale closure и случая без cleanup при slotServings === servingsSelected). */
  const fromMealPlanPersistRef = useRef(false);
  const plannedDatePersistRef = useRef<string | null>(null);
  const planMealTypePersistRef = useRef<string | null>(null);
  const planRowMemberIdPersistRef = useRef<string | null | undefined>(undefined);
  const servingsSelectedPersistRef = useRef(1);
  const slotServingsPersistRef = useRef<number | undefined>(undefined);
  const planSlotResolvedPersistRef = useRef(false);
  fromMealPlanPersistRef.current = !!fromMealPlan;
  plannedDatePersistRef.current = plannedDate;
  planMealTypePersistRef.current = planMealType;
  planRowMemberIdPersistRef.current = planRowMemberId;
  servingsSelectedPersistRef.current = servingsSelected;
  slotServingsPersistRef.current = slotServings;
  planSlotResolvedPersistRef.current = planSlotResolved;

  // Стабильная подпись ингредиентов, чтобы не пересчитывать scaledOverrides при refetch с тем же составом
  const ingredientsSignature = recipe?.ingredients != null ? JSON.stringify(recipe.ingredients) : "";

  // Порции из плана: не ждём загрузку recipe — id из URL + dayPlans из кэша; иначе кадр с 1 и скачок после fetch рецепта.
  // Пока слота нет в dayPlans (кэш/ключ запроса), не подставляем servings_recommended — иначе «мигание» с реальным meals.*.servings.
  // Если в слоте нет meals.*.servings — дефолт по servings_base (канон для ингредиентов), не по recommended (часто 4), иначе 4↔1.
  // После save слота кэш плана патчится в updateSlotServings (без invalidate всего meal_plans_v2).
  useEffect(() => {
    if (!servingsViewKey) return;

    if (fromFavorites) {
      if (servingsHydratedViewKeyRef.current === servingsViewKey) return;
      setServingsSelected(1);
      servingsHydratedViewKeyRef.current = servingsViewKey;
      return;
    }

    if (!fromMealPlan) {
      if (!recipe?.id) return;
      if (userHasChangedServingsRef.current) return;
      if (servingsHydratedViewKeyRef.current === servingsViewKey) return;
      const base = (recipe as { servings_base?: number | null }).servings_base ?? 1;
      const recommended = (recipe as { servings_recommended?: number | null }).servings_recommended ?? 4;
      const defaultServings = base >= 4 ? base : recommended;
      setServingsSelected(defaultServings >= 1 ? defaultServings : 1);
      servingsHydratedViewKeyRef.current = servingsViewKey;
      return;
    }

    if (!id || !plannedDate || !planMealType) return;
    if (dayPlanBlocked) return;

    if (userHasChangedServingsRef.current) return;

    if (servingsHydratedViewKeyRef.current === servingsViewKey) {
      if (slotServings != null && slotServings >= 1 && slotServings !== servingsSelected) {
        setServingsSelected(slotServings);
      }
      if (slotServings === servingsSelected) {
        userHasChangedServingsRef.current = false;
      }
      return;
    }

    if (slotServings != null && slotServings >= 1) {
      setServingsSelected(slotServings);
      servingsHydratedViewKeyRef.current = servingsViewKey;
      return;
    }
    if (!recipe?.id) return;
    if (!planSlotResolved) return;

    const sb = Math.max(1, (recipe as { servings_base?: number | null }).servings_base ?? 1);
    setServingsSelected(sb);
    servingsHydratedViewKeyRef.current = servingsViewKey;
  }, [
    servingsViewKey,
    fromFavorites,
    fromMealPlan,
    id,
    recipe?.id,
    plannedDate,
    planMealType,
    slotServings,
    servingsSelected,
    dayPlanBlocked,
    planSlotResolved,
  ]);

  // Сохранение порций в meals.*.servings (meal_plans_v2). Debounce + обязательный cleanup при unmount по refs.
  // Раньше при slotServings === servingsSelected эффект делал ранний return без cleanup — при закрытии карточки flush не вызывался, если последний run был «чистый».
  // Без найденного слота в dayPlans не пишем: slotServings === undefined раньше давало ложный mismatch и cleanup перетирал план дефолтом рецепта.
  const servingsSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!fromMealPlan || plannedDate == null || planMealType == null) {
      return undefined;
    }
    if (planMemberScopePending) {
      return undefined;
    }
    if (!planSlotResolved) {
      return undefined;
    }

    if (servingsSelected !== slotServings && servingsSelected >= 1) {
      if (servingsSaveRef.current) clearTimeout(servingsSaveRef.current);
      servingsSaveRef.current = setTimeout(() => {
        servingsSaveRef.current = null;
        const next = servingsSelectedPersistRef.current;
        if (next < 1) return;
        const pd = plannedDatePersistRef.current;
        const mt = planMealTypePersistRef.current;
        if (pd == null || mt == null) return;
        updateSlotServings({
          planned_date: pd,
          member_id: planRowMemberIdPersistRef.current ?? null,
          meal_type: mt as "breakfast" | "lunch" | "snack" | "dinner",
          servings: next,
        }).catch(() => {});
      }, 400);
    }

    return () => {
      if (servingsSaveRef.current) {
        clearTimeout(servingsSaveRef.current);
        servingsSaveRef.current = null;
      }
      if (!fromMealPlanPersistRef.current) return;
      if (!planSlotResolvedPersistRef.current) return;
      const pd = plannedDatePersistRef.current;
      const mt = planMealTypePersistRef.current;
      if (pd == null || mt == null) return;
      const sel = servingsSelectedPersistRef.current;
      const sl = slotServingsPersistRef.current;
      if (sel >= 1 && sel !== sl) {
        updateSlotServings({
          planned_date: pd,
          member_id: planRowMemberIdPersistRef.current ?? null,
          meal_type: mt as "breakfast" | "lunch" | "snack" | "dinner",
          servings: sel,
        }).catch(() => {});
      }
    };
  }, [
    fromMealPlan,
    plannedDate,
    planMealType,
    planRowMemberId,
    planMemberScopePending,
    planSlotResolved,
    slotServings,
    servingsSelected,
    updateSlotServings,
  ]);

  const displayIngredients = recipe ? getDisplayIngredients(recipe as RecipeDisplayIngredients) : [];
  const servingsBase = Math.max(1, (recipe as { servings_base?: number | null })?.servings_base ?? 1);
  const servingMultiplier = servingsSelected / servingsBase;

  const planApplied = useMemo(() => {
    if (!fromMealPlan || !recipe || displayIngredients.length === 0) return null;
    return applyIngredientOverrides(displayIngredients, slotOverrides, servingMultiplier, servingsBase);
  }, [fromMealPlan, recipe?.id, displayIngredients, slotOverrides, servingMultiplier, servingsBase]);

  const ingredientsForChips = fromMealPlan && planApplied ? planApplied.displayItems : displayIngredients;
  const keysForDisplayItems = planApplied?.keysForDisplayItems ?? [];
  const keysByIndex = planApplied?.keysByIndex ?? displayIngredients.map((ing, i) => ingredientKey(ing as { name?: string } & Record<string, unknown>, i));

  const scaledOverrides: IngredientOverrides = useMemo(() => {
    if (!recipe || fromMealPlan) return {};
    const multiplier = servingsSelected / servingsBase;
    if (multiplier === 1) return {};
    return Object.fromEntries(displayIngredients.map((ing, i) => [i, scaleIngredientDisplay(ing, multiplier)])) as IngredientOverrides;
  }, [recipe?.id, servingsSelected, servingsBase, ingredientsSignature, fromMealPlan]);

  const backButton = (
    <motion.button
      type="button"
      onClick={() => (fromMealPlan ? navigate(mealPlanReturnPath) : navigate(-1))}
      aria-label="Назад"
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.15 }}
      className="h-10 w-10 min-h-[40px] min-w-[40px] rounded-full flex items-center justify-center text-foreground hover:bg-primary/10 active:bg-primary/15 transition-colors duration-150 touch-manipulation"
    >
      <ArrowLeft className="w-5 h-5" />
    </motion.button>
  );

  if (isInitialLoading) {
    return (
      <MobileLayout
        title={headerTitle}
        headerNoBlur
        headerWrapTitle
        headerClassName="layout-header-recipe border-b border-border/30"
        mainClassName="recipe-page-main"
        headerLeft={backButton}
      >
        <div className="px-4 pb-6 max-w-[100%] mx-auto overflow-x-hidden">
          <div className="-mx-2">
            <div className={cn(recipeHeroCard, "relative space-y-4 p-6")}>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
          </div>

          <div className="flex flex-row items-center gap-2 mt-3">
            {Array.from({ length: 5 }).map((_, idx) => (
              <Skeleton key={idx} className="h-9 w-9 rounded-full" />
            ))}
          </div>

          {!fromFavorites && (
            <div className="mt-5">
              <Skeleton className="h-3 w-14 mb-2" />
              <div className="inline-flex items-center rounded-[999px] border border-primary-border/60 overflow-hidden px-2 py-1 gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-5 w-8" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            </div>
          )}

          <div className="mt-6">
            <Skeleton className="h-4 w-40 mb-3" />
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="h-4 w-full" />
              ))}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-10/12" />
          </div>
        </div>
      </MobileLayout>
    );
  }

  if (error || !recipe) {
    return (
      <MobileLayout title="Рецепт" headerLeft={backButton}>
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <p className="text-muted-foreground mb-4">Рецепт не найден</p>
          <Button className="bg-primary hover:opacity-90 text-white border-0" onClick={() => (fromMealPlan ? navigate(mealPlanReturnPath) : navigate("/home"))}>
            {fromMealPlan ? "К плану питания" : "На главную"}
          </Button>
        </div>
      </MobileLayout>
    );
  }

  const recipeDisplay = recipe as RecipeDisplayIngredients & {
    title?: string;
    description?: string;
    steps?: { instruction?: string; step_number?: number }[];
    chefAdvice?: string;
    advice?: string | null;
    cooking_time_minutes?: number | null;
    min_age_months?: number | null;
    max_age_months?: number | null;
    source?: string | null;
    servings_base?: number | null;
    servings_recommended?: number | null;
    nutrition_goals?: string[] | null;
  };
  const isUserCustom = recipeDisplay.source === "user_custom";
  const steps = recipeDisplay.steps ?? [];
  const chefAdvice = recipeDisplay.chefAdvice ?? (recipeDisplay as { chef_advice?: string | null }).chef_advice;
  const advice = recipeDisplay.advice ?? (recipeDisplay as { advice?: string | null }).advice;
  const cookingTime = recipeDisplay.cooking_time_minutes;
  const mealType = (recipeDisplay as { meal_type?: string | null }).meal_type ?? null;
  const mealLabel = getMealLabel(mealType);
  const minAgeMonths = recipeDisplay.min_age_months;
  const nutritionGoals = recipeDisplay.nutrition_goals ?? [];

  const isInfant = isInfantRecipe({ max_age_months: recipeDisplay.max_age_months });

  const chefAdvicePresentation = getChefAdviceCardPresentation({
    recipe: { max_age_months: recipeDisplay.max_age_months },
    isChefTip: true,
  });
  const miniAdvicePresentation = getChefAdviceCardPresentation({
    recipe: { max_age_months: recipeDisplay.max_age_months },
    isChefTip: false,
  });

  const handleDeleteRecipe = async () => {
    if (!id) return;
    try {
      await deleteUserRecipe(id);
      toast({ title: "Рецепт удалён" });
      setDeleteConfirmOpen(false);
      navigate("/favorites", { state: { tab: "my_recipes" } });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error)?.message ?? "Не удалось удалить" });
    }
  };

  const benefitLabel = getBenefitLabel(selectedMember?.age_months ?? undefined);
  const benefitLabelForDisplay = isInfant ? null : benefitLabel;
  const benefitDescription = buildRecipeBenefitDescription({
    recipeId: id ?? null,
    goals: nutritionGoals,
    title: recipeDisplay.title ?? "",
  });
  const dbDescription = (recipeDisplay.description ?? "").trim();
  const heroDescription = dbDescription.length > 0 ? dbDescription : benefitDescription;
  const recipeNutrition =
    (recipe as { calories?: number | null; proteins?: number | null; fats?: number | null; carbs?: number | null }).calories != null ||
    (recipe as { proteins?: number | null }).proteins != null ||
    (recipe as { fats?: number | null }).fats != null ||
    (recipe as { carbs?: number | null }).carbs != null
      ? {
          calories: (recipe as { calories?: number | null }).calories ?? null,
          proteins: (recipe as { proteins?: number | null }).proteins ?? null,
          fats: (recipe as { fats?: number | null }).fats ?? null,
          carbs: (recipe as { carbs?: number | null }).carbs ?? null,
        }
      : null;

  const handleAddIngredientsToShopping = async () => {
    if (!id || !recipe) return;
    if (recipe && isInfantRecipe(recipe)) return;
    if (!hasAccess) {
      setPaywallReason("shopping_list");
      setPaywallCustomMessage(null);
      setShowPaywall(true);
      return;
    }
    const rows = recipeRpcIngredientsToShoppingRows((recipe as { ingredients?: unknown[] }).ingredients);
    if (rows.length === 0) {
      toast({ title: "Нет ингредиентов для списка" });
      return;
    }
    const sb = Math.max(1, (recipe as { servings_base?: number | null }).servings_base ?? 1);
    const multiplier = servingsSelected / sb;
    const title = recipeDisplay.title ?? "Рецепт";
    const payloads = buildShoppingIngredientPayloadsFromRecipe(rows, multiplier, id, title);
    if (payloads.length === 0) {
      toast({ title: "Не удалось подготовить количества для списка" });
      return;
    }
    try {
      const { wasEmpty } = await addRecipeIngredients({
        payloads,
        recipeServings: { recipe_id: id, servings_selected: servingsSelected },
      });
      toast({
        title: wasEmpty ? "Создали список и добавили ингредиенты ✓" : "Добавили в список покупок ✓",
        action: (
          <ToastAction
            altText="Открыть список продуктов"
            onClick={() => {
              markShoppingListEntranceStagger();
              navigate("/favorites", { state: { tab: "shopping_list" } });
            }}
          >
            К списку продуктов
          </ToastAction>
        ),
      });
    } catch {
      toast({ variant: "destructive", title: "Не удалось добавить в список" });
    }
  };

  const shoppingRowsForButton = recipeRpcIngredientsToShoppingRows((recipe as { ingredients?: unknown[] }).ingredients);

  return (
    <MobileLayout
      title={headerTitle}
      headerNoBlur
      headerWrapTitle
      headerClassName="layout-header-recipe border-b border-border/30"
      mainClassName="recipe-page-main"
      headerLeft={backButton}
    >
      <div className="px-4 pb-6 max-w-[100%] mx-auto overflow-x-hidden">
        {/* Hero card: чуть шире (меньше отступ от краёв на 8px), визуальный акцент */}
        <div className="-mx-2">
          <div className={cn(recipeHeroCard, "relative space-y-4 p-6")}>
            <div className="space-y-4">
              <RecipeNutritionHeader
                mealTypeLabel={mealLabel}
                cookingTimeMinutes={typeof cookingTime === "number" ? cookingTime : null}
                nutrition={recipeNutrition}
                variant="details"
              />

              {benefitLabelForDisplay && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <span aria-hidden="true">🌿</span>
                  <span>{benefitLabelForDisplay}</span>
                </p>
              )}
              <p className="text-sm text-muted-foreground leading-[1.6]">{heroDescription}</p>
              <NutritionGoalsChips goals={nutritionGoals} className="mt-1" />
            </div>
          </div>
        </div>

        {/* Компактная панель действий под названием (как в рецепте из чата) */}
        <div
          className="flex flex-row items-center gap-2 mt-3"
          style={{ touchAction: "manipulation" }}
        >
          <motion.button
            type="button"
            onClick={handleToggleFavorite}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "h-9 w-9 rounded-full shrink-0 flex items-center justify-center transition-all",
              isFavorite
                ? "text-primary bg-primary/10 border border-primary/20 fill-primary"
                : "text-muted-foreground bg-muted/50 border border-border hover:bg-muted hover:text-foreground"
            )}
            aria-label={isFavorite ? "Удалить из избранного" : "В избранное"}
            title={isFavorite ? "Удалить из избранного" : "В избранное"}
          >
            <Heart className={cn("h-4 w-4", isFavorite && "fill-current")} />
          </motion.button>
          <motion.button
            type="button"
            onClick={handleShare}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-muted-foreground bg-muted/50 border border-border hover:bg-muted hover:text-foreground transition-all"
            aria-label="Поделиться"
            title="Поделиться"
          >
            <ShareIosIcon className="h-4 w-4" />
          </motion.button>
          {!isUserCustom && (
            <>
              <motion.button
                type="button"
                onClick={() => handleRecipeFeedback("like")}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  "h-9 w-9 rounded-full shrink-0 flex items-center justify-center transition-all border",
                  userVote === "like"
                    ? "text-primary bg-primary/10 border-primary/20 fill-primary"
                    : "text-muted-foreground bg-muted/50 border-border hover:bg-muted hover:text-foreground"
                )}
                aria-label={userVote === "like" ? "Нравится (выбрано)" : "Нравится"}
                title="Нравится"
              >
                <ThumbsUp className={cn("h-4 w-4", userVote === "like" && "fill-current")} />
              </motion.button>
              <motion.button
                type="button"
                onClick={() => handleRecipeFeedback("dislike")}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  "h-9 w-9 rounded-full shrink-0 flex items-center justify-center transition-all border",
                  userVote === "dislike"
                    ? "text-destructive bg-destructive/10 border-destructive/20 fill-destructive"
                    : "text-muted-foreground bg-muted/50 border-border hover:bg-muted hover:text-foreground"
                )}
                aria-label={userVote === "dislike" ? "Не нравится (выбрано)" : "Не нравится"}
                title="Не нравится"
              >
                <ThumbsDown className={cn("h-4 w-4", userVote === "dislike" && "fill-current")} />
              </motion.button>
            </>
          )}
          {hasAccess ? (
            <motion.button
              type="button"
              onClick={() => setAddToPlanOpen(true)}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-muted-foreground bg-muted/50 border border-border hover:bg-muted hover:text-foreground transition-all"
              aria-label="Добавить в план"
              title="В план"
            >
              <CalendarPlus className="h-4 w-4" />
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={() => {
                setPaywallReason("plan_week_locked");
                setPaywallCustomMessage(null);
                setShowPaywall(true);
              }}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-muted-foreground bg-muted/50 border border-border hover:bg-muted hover:text-foreground transition-all"
              aria-label="В план (полная версия)"
              title="В план (полная версия)"
            >
              <CalendarPlus className="h-4 w-4" />
            </motion.button>
          )}
          {isUserCustom && (
            <>
              <motion.button
                type="button"
                onClick={() => setEditSheetOpen(true)}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-muted-foreground bg-muted/50 border border-border hover:bg-muted hover:text-foreground transition-all"
                aria-label="Редактировать"
                title="Изменить"
              >
                <Pencil className="h-4 w-4" />
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={isDeleting}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-muted-foreground bg-muted/50 border border-border hover:bg-muted hover:text-foreground transition-all disabled:opacity-50"
                aria-label="Удалить рецепт"
                title="Удалить"
              >
                <Trash2 className="h-4 w-4" />
              </motion.button>
            </>
          )}
        </div>

        {/* Ингредиенты: порции — компактный степпер справа от заголовка (не из Избранного) */}
        <RecipeIngredientList
          className="mt-6"
          ingredients={ingredientsForChips}
          overrides={fromMealPlan ? {} : overrides}
          scaledOverrides={fromMealPlan ? undefined : scaledOverrides}
          ingredientServingMultiplier={fromMealPlan ? 1 : servingMultiplier}
          servingsCount={servingsSelected}
          hideServingsSubtitle={fromFavorites}
          headerRight={
            !fromFavorites ? (
              <div
                className="inline-flex items-center rounded-full bg-primary-light/50 border border-primary-border/70 overflow-hidden shadow-sm"
                role="group"
                aria-label="Количество порций"
              >
                <motion.button
                  type="button"
                  onClick={() => {
                    userHasChangedServingsRef.current = true;
                    setServingsSelected((s) => Math.max(1, s - 1));
                  }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.1 }}
                  className="h-8 w-9 flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-primary/15 text-base leading-none font-medium touch-manipulation"
                  aria-label="Уменьшить порции"
                >
                  −
                </motion.button>
                <span className="min-w-[1.5rem] px-0.5 text-center text-xs font-semibold text-foreground tabular-nums" aria-live="polite">
                  {servingsSelected}
                </span>
                <motion.button
                  type="button"
                  onClick={() => {
                    userHasChangedServingsRef.current = true;
                    setServingsSelected((s) => Math.min(20, s + 1));
                  }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.1 }}
                  className="h-8 w-9 flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-primary/15 text-base leading-none font-medium touch-manipulation"
                  aria-label="Увеличить порции"
                >
                  +
                </motion.button>
              </div>
            ) : undefined
          }
        />

        {id && recipe && !isInfantRecipe(recipe) && (
          <div className="mt-4">
            <Button
              type="button"
              variant="secondary"
              className="w-full gap-2 justify-center border-border/80 text-foreground"
              disabled={isAddingToList || shoppingRowsForButton.length === 0}
              onClick={() => void handleAddIngredientsToShopping()}
            >
              <ShoppingCart className="w-4 h-4 shrink-0" aria-hidden />
              Добавить в покупки
            </Button>
          </div>
        )}

        {chefAdvice?.trim() ? (
          <ChefAdviceCard
            title={chefAdvicePresentation.title}
            body={chefAdvice.trim()}
            isChefTip={chefAdvicePresentation.isChefTip}
            className="mt-6"
          />
        ) : advice?.trim() ? (
          <ChefAdviceCard
            title={miniAdvicePresentation.title}
            body={advice.trim()}
            isChefTip={miniAdvicePresentation.isChefTip}
            className="mt-6"
          />
        ) : null}

        <RecipeSteps steps={steps} className="mt-6" />

      </div>

      {id && recipe && (
        <AddToPlanSheet
          open={addToPlanOpen}
          onOpenChange={setAddToPlanOpen}
          recipeId={id}
          recipeTitle={(recipe as { title?: string }).title ?? "Рецепт"}
          mealType={fromMealPlan && planMealType ? planMealType : (recipe as { meal_type?: string }).meal_type ?? null}
          defaultMemberId={favoriteMemberId}
          defaultDayKey={fromMealPlan && plannedDate ? plannedDate : undefined}
          targetSlot={
            fromMealPlan && plannedDate && planMealType
              ? { dayKey: plannedDate, mealType: planMealType }
              : null
          }
          onSuccess={() => toast({ title: "Добавлено в план" })}
        />
      )}

      {id && isUserCustom && (
        <MyRecipeFormSheet
          open={editSheetOpen}
          onOpenChange={setEditSheetOpen}
          recipeId={id}
          onSuccess={() => toast({ title: "Рецепт обновлён" })}
        />
      )}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить рецепт?</AlertDialogTitle>
            <AlertDialogDescription>
              Рецепт будет удалён без возможности восстановления.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRecipe} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? "Удаляем…" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileLayout>
  );
}
