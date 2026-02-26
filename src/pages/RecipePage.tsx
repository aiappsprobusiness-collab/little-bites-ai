import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Loader2, ArrowLeft, Heart, Share2, CalendarPlus, Pencil, Trash2, Clock } from "lucide-react";
import { useRecipes } from "@/hooks/useRecipes";
import { useFavorites } from "@/hooks/useFavorites";
import { useMyRecipes } from "@/hooks/useMyRecipes";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { IngredientItem, RecipeDisplayIngredients } from "@/types/recipe";
import { scaleIngredientDisplay } from "@/types/recipe";
import { buildRecipeShareText } from "@/utils/shareRecipeText";
import { IngredientSubstituteSheet } from "@/components/recipe/IngredientSubstituteSheet";
import { AddToPlanSheet } from "@/components/plan/AddToPlanSheet";
import { MyRecipeFormSheet } from "@/components/favorites/MyRecipeFormSheet";
import { useFamily } from "@/contexts/FamilyContext";
import { useAppStore } from "@/store/useAppStore";
import { getBenefitLabel } from "@/utils/ageCategory";
import { getMealLabel } from "@/data/mealLabels";
import { recipeHeroCard, recipeTimeClass, recipeMealBadge } from "@/theme/recipeTokens";
import { IngredientChips, type IngredientOverrides } from "@/components/recipe/IngredientChips";
import { ChefAdviceCard } from "@/components/recipe/ChefAdviceCard";
import { RecipeSteps } from "@/components/recipe/RecipeSteps";
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
  const state = location.state as { fromMealPlan?: boolean; mealTypeLabel?: string; memberId?: string } | null;

  useEffect(() => {
    if (import.meta.env.DEV && searchParams.get("debugIngredients") === "1" && id && recipe) {
      const raw = (recipe as { ingredients?: unknown[] }).ingredients;
      console.debug("[debugIngredients] recipe_id=", id, "recipe_title=", (recipe as { title?: string }).title, "recipe_ingredients (raw)=", raw);
    }
  }, [import.meta.env.DEV, searchParams, id, recipe]);
  const fromMealPlan = state?.fromMealPlan;
  const mealTypeLabel = state?.mealTypeLabel;
  const stateMemberId = state?.memberId ?? null;
  const favoriteMemberId = stateMemberId ?? (selectedMemberId && selectedMemberId !== "family" ? selectedMemberId : null);

  const { isFavorite: isFavoriteFn, toggleFavorite } = useFavorites("all");
  const isFavorite = !!id && isFavoriteFn(id, favoriteMemberId);
  const { deleteUserRecipe, isDeleting } = useMyRecipes();
  const [addToPlanOpen, setAddToPlanOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

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
    const recipeDisplay = recipe as RecipeDisplayIngredients & {
      title?: string;
      description?: string;
      cooking_time_minutes?: number | null;
      steps?: { instruction?: string; step_number?: number }[];
      chefAdvice?: string | null;
      chef_advice?: string | null;
      meal_type?: string | null;
    };
    const displayIngredients = getDisplayIngredients(recipeDisplay);
    const shareText = buildRecipeShareText({
      title: recipeDisplay.title ?? "Рецепт",
      description: recipeDisplay.description ?? null,
      cooking_time_minutes: recipeDisplay.cooking_time_minutes ?? null,
      recipeId: id,
      ingredients: displayIngredients,
      steps: recipeDisplay.steps ?? null,
      chefAdvice: recipeDisplay.chefAdvice ?? recipeDisplay.chef_advice ?? null,
      mealTypeLabel: mealTypeLabel ?? null,
      meal_type: recipeDisplay.meal_type ?? null,
    });
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
  const [substituteSheet, setSubstituteSheet] = useState<{
    open: boolean;
    index: number;
    ing: IngredientItem;
  } | null>(null);

  // Стабильная подпись ингредиентов, чтобы не пересчитывать scaledOverrides при refetch с тем же составом
  const ingredientsSignature = recipe?.ingredients != null ? JSON.stringify(recipe.ingredients) : "";

  // Синхронизируем порции при смене рецепта: family-sized (servings_base >= 4) → default = servings_base, иначе servings_recommended
  useEffect(() => {
    if (!recipe?.id) return;
    const base = (recipe as { servings_base?: number | null }).servings_base ?? 1;
    const recommended = (recipe as { servings_recommended?: number | null }).servings_recommended ?? 1;
    const defaultServings = base >= 4 ? base : recommended;
    setServingsSelected(defaultServings >= 1 ? defaultServings : 1);
  }, [recipe?.id]);

  // Масштабирование ингредиентов по выбранным порциям; зависимости без всего recipe — не пересчёт при refetch
  const scaledOverrides: IngredientOverrides = useMemo(() => {
    if (!recipe) return {};
    const displayIngredients = getDisplayIngredients(recipe as RecipeDisplayIngredients);
    const servingsBase = Math.max(1, (recipe as { servings_base?: number | null }).servings_base ?? 1);
    const multiplier = servingsSelected / servingsBase;
    if (multiplier === 1) return {};
    return Object.fromEntries(displayIngredients.map((ing, i) => [i, scaleIngredientDisplay(ing, multiplier)])) as IngredientOverrides;
  }, [recipe?.id, servingsSelected, recipe?.servings_base ?? 1, recipe?.servings_recommended ?? 1, ingredientsSignature]);

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

  if (isLoading) {
    return (
      <MobileLayout title="Рецепт" headerLeft={backButton}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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
  };
  const isUserCustom = recipeDisplay.source === "user_custom";
  const displayIngredients = getDisplayIngredients(recipeDisplay);
  const steps = recipeDisplay.steps ?? [];
  const chefAdvice = recipeDisplay.chefAdvice ?? (recipeDisplay as { chef_advice?: string | null }).chef_advice;
  const advice = recipeDisplay.advice ?? (recipeDisplay as { advice?: string | null }).advice;
  const cookingTime = recipeDisplay.cooking_time_minutes;
  const mealType = (recipeDisplay as { meal_type?: string | null }).meal_type ?? null;
  const mealLabel = getMealLabel(mealType);
  const minAgeMonths = recipeDisplay.min_age_months;
  const description = recipeDisplay.description;

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

  const benefitLabel = description?.trim() ? getBenefitLabel(selectedMember?.age_months ?? undefined) : null;

  return (
    <MobileLayout
      title={recipe.title ?? "Рецепт"}
      headerNoBlur
      headerClassName="layout-header-recipe border-b border-border/30"
      mainClassName="recipe-page-main"
      headerLeft={backButton}
    >
      <div className="px-4 pb-6 max-w-[100%] mx-auto overflow-x-hidden">
        {/* Hero card: чуть шире (меньше отступ от краёв на 8px), визуальный акцент */}
        <div className="-mx-2">
          <div className={cn(recipeHeroCard, "space-y-3")}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            {mealLabel && <span className={recipeMealBadge}>{mealLabel}</span>}
            {cookingTime != null && cookingTime > 0 && (
              <span className={cn(recipeTimeClass)}>
                <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden />
                <span>{cookingTime} мин</span>
              </span>
            )}
          </div>
          {benefitLabel && (
            <p className="text-xs font-semibold text-muted-foreground">{benefitLabel}</p>
          )}
          {description?.trim() && (
            <p className="text-sm text-muted-foreground leading-[1.6]">{description.trim()}</p>
          )}
          </div>
        </div>

        {/* Actions: Hero → 12px; тактильная отдача scale 0.96, 150ms */}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {hasAccess && (
            <motion.div whileTap={{ scale: 0.96 }} transition={{ duration: 0.15 }}>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-full border-primary-border text-primary hover:bg-primary/10 hover:border-primary/50 h-10 px-3 transition-opacity duration-150"
                onClick={() => setAddToPlanOpen(true)}
                aria-label="Добавить в план"
              >
                <CalendarPlus className="h-4 w-4 shrink-0" />
                <span className="text-sm">В план</span>
              </Button>
            </motion.div>
          )}
          <motion.button
            type="button"
            onClick={handleToggleFavorite}
            aria-label={isFavorite ? "Удалить из избранного" : "В избранное"}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "h-10 w-10 min-h-[40px] min-w-[40px] rounded-full shrink-0 flex items-center justify-center border touch-manipulation transition-colors duration-150",
              isFavorite
                ? "text-primary bg-primary/10 border-primary/40 fill-primary"
                : "text-muted-foreground bg-primary-light/50 border-primary-border/80 hover:bg-primary/10 hover:border-primary/40 hover:text-foreground"
            )}
          >
            <Heart className={cn("h-4 w-4 transition-opacity duration-150", isFavorite && "fill-current")} />
          </motion.button>
          <motion.button
            type="button"
            onClick={handleShare}
            aria-label="Поделиться"
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="h-10 w-10 min-h-[40px] min-w-[40px] rounded-full shrink-0 flex items-center justify-center text-muted-foreground bg-primary-light/50 border border-primary-border/80 hover:bg-primary/10 hover:border-primary/40 hover:text-foreground transition-colors duration-150 touch-manipulation"
          >
            <Share2 className="h-4 w-4" />
          </motion.button>
          {isUserCustom && (
            <>
              <motion.div whileTap={{ scale: 0.96 }} transition={{ duration: 0.15 }}>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-full border-primary-border/60 text-primary hover:bg-primary/10 h-10 px-3"
                  onClick={() => setEditSheetOpen(true)}
                  aria-label="Редактировать"
                >
                  <Pencil className="h-4 w-4 shrink-0" />
                  <span className="text-sm">Изменить</span>
                </Button>
              </motion.div>
              <motion.div whileTap={{ scale: 0.96 }} transition={{ duration: 0.15 }}>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 h-10 px-3"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={isDeleting}
                  aria-label="Удалить рецепт"
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span className="text-sm">Удалить</span>
                </Button>
              </motion.div>
            </>
          )}
        </div>

        {/* Порции: Actions → 18px; капсула − [ 1 ] + */}
        <div className="space-y-2 mt-[18px]">
          <span className="text-[11px] font-medium text-muted-foreground/90 block">Порции</span>
          <div className="inline-flex items-center rounded-[999px] bg-primary-light/40 border border-primary-border/60 overflow-hidden">
            <motion.button
              type="button"
              onClick={() => setServingsSelected((s) => Math.max(1, s - 1))}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.1 }}
              className="h-10 min-w-[44px] px-3 flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-primary/10 transition-colors duration-150 touch-manipulation"
              aria-label="Уменьшить порции"
            >
              −
            </motion.button>
            <span className="min-w-[2.75rem] text-center text-sm font-semibold text-foreground" aria-live="polite">
              {servingsSelected}
            </span>
            <motion.button
              type="button"
              onClick={() => setServingsSelected((s) => Math.min(20, s + 1))}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.1 }}
              className="h-10 min-w-[44px] px-3 flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-primary/10 transition-colors duration-150 touch-manipulation"
              aria-label="Увеличить порции"
            >
              +
            </motion.button>
          </div>
        </div>

        {/* Ингредиенты: нижние секции — 24px как раньше */}
        <IngredientChips
          className="mt-6"
          ingredients={displayIngredients}
          overrides={overrides}
          scaledOverrides={scaledOverrides}
          variant="full"
          showSubstituteButton
          onSubstituteClick={isFree ? undefined : (index, ing) => setSubstituteSheet({ open: true, index, ing: ing as IngredientItem })}
          onLockClick={isFree ? () => {
            setPaywallCustomMessage("Замена ингредиентов доступна в Premium. Попробуйте Trial или оформите подписку.");
            setShowPaywall(true);
          } : undefined}
        />

        {chefAdvice?.trim() ? (
          <ChefAdviceCard title="Совет от шефа" body={chefAdvice.trim()} isChefTip className="mt-6" />
        ) : advice?.trim() ? (
          <ChefAdviceCard title="Совет от шефа" body={advice.trim()} isChefTip={false} className="mt-6" />
        ) : null}

        <RecipeSteps steps={steps} className="mt-6" />

        <IngredientSubstituteSheet
          open={!!substituteSheet?.open}
          onOpenChange={(open) => setSubstituteSheet((s) => (s ? { ...s, open } : null))}
          ingredientName={substituteSheet?.ing.name ?? ""}
          substituteFromDb={substituteSheet?.ing.substitute}
          onSelect={(replacement) => {
            if (substituteSheet != null) {
              setOverrides((prev) => ({ ...prev, [substituteSheet.index]: replacement }));
              toast({ title: "Ингредиент заменён" });
            }
          }}
        />
      </div>

      {id && recipe && (
        <AddToPlanSheet
          open={addToPlanOpen}
          onOpenChange={setAddToPlanOpen}
          recipeId={id}
          recipeTitle={(recipe as { title?: string }).title ?? "Рецепт"}
          mealType={(recipe as { meal_type?: string }).meal_type ?? null}
          defaultMemberId={favoriteMemberId}
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
