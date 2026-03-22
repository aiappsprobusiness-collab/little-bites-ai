import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { ArrowLeft, Heart, CalendarPlus, Pencil, Trash2, ThumbsUp, ThumbsDown } from "lucide-react";
import { useRecipes } from "@/hooks/useRecipes";
import { useFavorites } from "@/hooks/useFavorites";
import { useMealPlans } from "@/hooks/useMealPlans";
import { useMyRecipes } from "@/hooks/useMyRecipes";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
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
    const o = item as { name?: string; display_text?: string | null; canonical_amount?: number | null; canonical_unit?: string | null; amount?: number | null; unit?: string | null; note?: string; substitute?: string | null };
    return {
      name: o.name ?? "",
      display_text: o.display_text ?? undefined,
      canonical_amount: o.canonical_amount ?? undefined,
      canonical_unit: (o.canonical_unit === "g" || o.canonical_unit === "ml" ? o.canonical_unit : undefined) as "g" | "ml" | undefined,
      amount: o.amount ?? undefined,
      unit: o.unit ?? undefined,
      note: o.note ?? undefined,
      substitute: o.substitute ?? undefined,
    };
  });
}

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { selectedMember, selectedMemberId } = useFamily();
  const { hasAccess } = useSubscription();
  const setShowPaywall = useAppStore((s) => s.setShowPaywall);
  const setPaywallCustomMessage = useAppStore((s) => s.setPaywallCustomMessage);
  const isFree = !hasAccess;
  const [searchParams] = useSearchParams();
  const { getRecipeById } = useRecipes();
  const { data: recipe, isLoading, error } = getRecipeById(id || "");
  const state = location.state as {
    fromMealPlan?: boolean;
    fromFavorites?: boolean;
    preloadedTitle?: string;
    mealTypeLabel?: string;
    memberId?: string;
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
  const fromMealPlan = state?.fromMealPlan;
  const fromFavorites = state?.fromFavorites;
  const mealTypeLabel = state?.mealTypeLabel;
  const stateMemberId = state?.memberId ?? null;
  const plannedDate = state?.plannedDate ?? null;
  const planMealType = state?.mealType ?? null;
  const favoriteMemberId = stateMemberId ?? (selectedMemberId && selectedMemberId !== "family" ? selectedMemberId : null);

  const planMemberId = state?.memberId ?? selectedMemberId ?? null;
  const planDate = fromMealPlan && plannedDate ? new Date(plannedDate + "T12:00:00") : new Date();
  const { data: dayPlans, isLoading: dayPlanLoading } = useMealPlans(planMemberId ?? undefined).getMealPlansByDate(planDate);
  const planSlot = fromMealPlan && plannedDate && planMealType
    ? dayPlans?.find((p) => p.planned_date === plannedDate && p.meal_type === planMealType)
    : null;
  const slotOverrides = planSlot?.ingredient_overrides ?? [];
  const slotServings = planSlot?.servings;

  const { updateSlotIngredientOverrides, updateSlotServings } = useMealPlans(planMemberId ?? undefined);

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
    supabase.rpc("get_recipe_my_vote", { p_recipe_id: id }).then(({ data }) => {
      if (!cancelled && data === "like") setUserVote("like");
      else if (!cancelled && data === "dislike") setUserVote("dislike");
      else if (!cancelled) setUserVote(null);
    }).catch(() => {
      if (!cancelled) setUserVote(null);
    });
    return () => { cancelled = true; };
  }, [id]);

  const handleRecipeFeedback = async (action: "like" | "dislike") => {
    if (!id) return;
    if (userVote === action) return; /* повторный тот же голос — no-op, без API и toast */
    try {
      await supabase.rpc("record_recipe_feedback", { p_recipe_id: id, p_action: action });
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
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: recipeDisplay.title ?? "Рецепт",
          text: shareText,
        });
        toast({ title: "Рецепт отправлен" });
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        toast({ title: "Рецепт скопирован" });
      } else {
        toast({ variant: "destructive", title: "Поделиться недоступно" });
      }
    } catch (e: unknown) {
      if ((e as Error)?.name !== "AbortError") {
        toast({ variant: "destructive", title: "Ошибка", description: (e as Error)?.message ?? "Не удалось поделиться" });
      }
    }
  };

  const [overrides, setOverrides] = useState<IngredientOverrides>({});
  const [servingsSelected, setServingsSelected] = useState(1);
  const userHasChangedServingsRef = useRef(false);
  const lastSyncedPlanSlotKeyRef = useRef<string | null>(null);

  // Стабильная подпись ингредиентов, чтобы не пересчитывать scaledOverrides при refetch с тем же составом
  const ingredientsSignature = recipe?.ingredients != null ? JSON.stringify(recipe.ingredients) : "";

  // Синхронизируем порции: из Избранного всегда 1; из слота плана — после готовности запроса плана на дату (иначе slotServings временно undefined → ложный дефолт и «дрифт» со списком покупок). При refetch подтягиваем серверные порции, если пользователь их не трогал.
  useEffect(() => {
    if (!recipe?.id) return;
    if (fromFavorites) {
      setServingsSelected(1);
      lastSyncedPlanSlotKeyRef.current = null;
      return;
    }
    if (!fromMealPlan) {
      lastSyncedPlanSlotKeyRef.current = null;
      userHasChangedServingsRef.current = false;
      const base = (recipe as { servings_base?: number | null }).servings_base ?? 1;
      const recommended = (recipe as { servings_recommended?: number | null }).servings_recommended ?? 1;
      const defaultServings = base >= 4 ? base : recommended;
      setServingsSelected(defaultServings >= 1 ? defaultServings : 1);
      return;
    }
    const planSlotSyncKey =
      plannedDate && planMealType ? `${plannedDate}-${planMealType}-${planMemberId ?? "fam"}-${recipe.id}` : null;
    if (!planSlotSyncKey) return;
    if (dayPlanLoading) return;

    if (planSlotSyncKey !== lastSyncedPlanSlotKeyRef.current) {
      lastSyncedPlanSlotKeyRef.current = planSlotSyncKey;
      userHasChangedServingsRef.current = false;
      if (slotServings != null && slotServings >= 1) {
        setServingsSelected(slotServings);
      } else {
        const base = (recipe as { servings_base?: number | null }).servings_base ?? 1;
        const recommended = (recipe as { servings_recommended?: number | null }).servings_recommended ?? 1;
        const defaultServings = base >= 4 ? base : recommended;
        setServingsSelected(defaultServings >= 1 ? defaultServings : 1);
      }
      return;
    }
    if (
      slotServings != null &&
      slotServings >= 1 &&
      slotServings !== servingsSelected &&
      !userHasChangedServingsRef.current
    ) {
      setServingsSelected(slotServings);
    }
    if (slotServings === servingsSelected) {
      userHasChangedServingsRef.current = false;
    }
  }, [
    recipe?.id,
    fromFavorites,
    fromMealPlan,
    plannedDate,
    planMealType,
    planMemberId,
    slotServings,
    servingsSelected,
    dayPlanLoading,
  ]);

  // Сохранение порций слота плана при изменении пользователем (debounce); при уходе со страницы — сохранить сразу
  const servingsSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!fromMealPlan || plannedDate == null || planMealType == null || planMemberId === undefined) return;
    if (slotServings === servingsSelected) return;
    if (servingsSaveRef.current) clearTimeout(servingsSaveRef.current);
    servingsSaveRef.current = setTimeout(() => {
      servingsSaveRef.current = null;
      const next = servingsSelected;
      if (next < 1) return;
      updateSlotServings({
        planned_date: plannedDate,
        member_id: planMemberId ?? null,
        meal_type: planMealType as "breakfast" | "lunch" | "snack" | "dinner",
        servings: next,
      }).catch(() => {});
    }, 400);
    return () => {
      if (servingsSaveRef.current) clearTimeout(servingsSaveRef.current);
      if (servingsSelected !== slotServings && servingsSelected >= 1) {
        updateSlotServings({
          planned_date: plannedDate,
          member_id: planMemberId ?? null,
          meal_type: planMealType as "breakfast" | "lunch" | "snack" | "dinner",
          servings: servingsSelected,
        }).catch(() => {});
      }
    };
  }, [fromMealPlan, plannedDate, planMealType, planMemberId, slotServings, servingsSelected, updateSlotServings]);

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
      onClick={() => (fromMealPlan ? navigate("/meal-plan") : navigate(-1))}
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
          <Button className="bg-primary hover:opacity-90 text-white border-0" onClick={() => (fromMealPlan ? navigate("/meal-plan") : navigate("/home"))}>
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
  const benefitDescription = buildRecipeBenefitDescription({
    recipeId: id ?? null,
    goals: nutritionGoals,
    title: recipeDisplay.title ?? "",
  });
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

              {benefitLabel && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <span aria-hidden="true">🌿</span>
                  <span>{benefitLabel}</span>
                </p>
              )}
              <p className="text-sm text-muted-foreground leading-[1.6]">{benefitDescription}</p>
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
                setPaywallCustomMessage("Добавление в план доступно в Premium.");
                setShowPaywall(true);
              }}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-muted-foreground bg-muted/50 border border-border hover:bg-muted hover:text-foreground transition-all"
              aria-label="В план (Premium)"
              title="В план (Premium)"
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

        {chefAdvice?.trim() ? (
          <ChefAdviceCard title="Совет от шефа" body={chefAdvice.trim()} isChefTip className="mt-6" />
        ) : advice?.trim() ? (
          <ChefAdviceCard title="Совет от шефа" body={advice.trim()} isChefTip={false} className="mt-6" />
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
