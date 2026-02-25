import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Loader2, ArrowLeft, RotateCcw, Heart, Share2, CalendarPlus, Pencil, Trash2, Lock } from "lucide-react";
import { useRecipes } from "@/hooks/useRecipes";
import { useFavorites } from "@/hooks/useFavorites";
import { useMyRecipes } from "@/hooks/useMyRecipes";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { IngredientItem, RecipeDisplayIngredients } from "@/types/recipe";
import { ingredientDisplayLabel, scaleIngredientDisplay } from "@/types/recipe";
import { buildRecipeShareText } from "@/utils/shareRecipeText";
import { IngredientSubstituteSheet } from "@/components/recipe/IngredientSubstituteSheet";
import { AddToPlanSheet } from "@/components/plan/AddToPlanSheet";
import { MyRecipeFormSheet } from "@/components/favorites/MyRecipeFormSheet";
import { useFamily } from "@/contexts/FamilyContext";
import { useAppStore } from "@/store/useAppStore";
import { getBenefitLabel } from "@/utils/ageCategory";
import { RecipeHeader } from "@/components/recipe/RecipeHeader";
import { IngredientChips } from "@/components/recipe/IngredientChips";
import { ChefAdviceCard } from "@/components/recipe/ChefAdviceCard";
import { RecipeSteps } from "@/components/recipe/RecipeSteps";
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

function formatAge(ageMonths: number | null | undefined): string {
  if (ageMonths == null) return "";
  if (ageMonths < 12) return `${ageMonths} мес`;
  const years = Math.floor(ageMonths / 12);
  if (years === 1) return "1 год";
  if (years >= 2 && years <= 4) return `${years} года`;
  return `${years} лет`;
}

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

  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [servingsSelected, setServingsSelected] = useState(1);
  const [substituteSheet, setSubstituteSheet] = useState<{
    open: boolean;
    index: number;
    ing: IngredientItem;
  } | null>(null);

  if (isLoading) {
    return (
      <MobileLayout title="Рецепт" headerLeft={<Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px]" onClick={() => navigate(-1)} aria-label="Назад"><ArrowLeft className="w-5 h-5" /></Button>}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  if (error || !recipe) {
    return (
      <MobileLayout title="Рецепт" headerLeft={<Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px]" onClick={() => navigate(-1)} aria-label="Назад"><ArrowLeft className="w-5 h-5" /></Button>}>
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
  useEffect(() => {
    const rec = recipeDisplay?.servings_recommended;
    if (rec != null && rec >= 1) setServingsSelected(rec);
  }, [recipeDisplay?.servings_recommended]);
  const isUserCustom = recipeDisplay.source === "user_custom";
  const displayIngredients = getDisplayIngredients(recipeDisplay);
  const steps = recipeDisplay.steps ?? [];
  const chefAdvice = recipeDisplay.chefAdvice ?? (recipeDisplay as { chef_advice?: string | null }).chef_advice;
  const advice = recipeDisplay.advice ?? (recipeDisplay as { advice?: string | null }).advice;
  const cookingTime = recipeDisplay.cooking_time_minutes;
  const minAgeMonths = recipeDisplay.min_age_months;
  const description = recipeDisplay.description;
  const servingsBase = Math.max(1, recipeDisplay.servings_base ?? 1);
  const multiplier = servingsSelected / servingsBase;
  const scaledOverrides = useMemo(() => {
    if (multiplier === 1) return {};
    return Object.fromEntries(displayIngredients.map((ing, i) => [i, scaleIngredientDisplay(ing, multiplier)]));
  }, [displayIngredients, multiplier]);

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

  const ageStr = formatAge(minAgeMonths ?? null);
  const mealStr = mealTypeLabel ?? "";
  const timeStr = cookingTime != null ? `${cookingTime} мин` : "";

  const handleBack = () => {
    if (fromMealPlan) navigate("/meal-plan");
    else navigate(-1);
  };

  return (
    <MobileLayout
      title={recipe.title ?? "Рецепт"}
      headerLeft={
        <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px]" onClick={handleBack} aria-label="Назад">
          <ArrowLeft className="w-5 h-5" />
        </Button>
      }
    >
      <div className="px-4 pb-6 max-w-[100%] mx-auto overflow-x-hidden">
        {/* Карточка рецепта — те же стили, что и в чате */}
        <div className="rounded-2xl sm:rounded-[28px] overflow-hidden bg-card border border-border shadow-soft">
          <RecipeHeader
            variant="full"
            mealLabel={mealStr || null}
            cookingTimeMinutes={cookingTime ?? null}
            title={recipe.title ?? "Рецепт"}
            benefitLabel={description?.trim() ? getBenefitLabel(selectedMember?.age_months ?? undefined) : null}
            description={description?.trim() ?? null}
          />
          <div className="px-3 py-3 sm:px-6 sm:py-4 space-y-4 sm:space-y-5">
          {/* Действия: оливковый акцент */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {hasAccess && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-full border-primary-border text-primary hover:bg-primary/10 hover:border-primary/50"
                onClick={() => setAddToPlanOpen(true)}
                aria-label="Добавить в план"
              >
                <CalendarPlus className="h-4 w-4 shrink-0" />
                <span className="text-typo-caption sm:text-typo-muted">Добавить в план</span>
              </Button>
            )}
            <button
              type="button"
              onClick={handleToggleFavorite}
              aria-label={isFavorite ? "Удалить из избранного" : "В избранное"}
              className={`h-8 w-8 sm:h-9 sm:w-9 rounded-full shrink-0 flex items-center justify-center transition-all active:scale-95 border ${
                isFavorite
                  ? "text-primary bg-primary/10 border-primary/40 fill-primary"
                  : "text-muted-foreground bg-primary-light/50 border-primary-border hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <Heart className={`h-4 w-4 sm:h-4.5 sm:w-4.5 ${isFavorite ? "fill-current" : ""}`} />
            </button>
            <button
              type="button"
              onClick={handleShare}
              aria-label="Поделиться"
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-full shrink-0 flex items-center justify-center text-muted-foreground bg-primary-light/50 border border-primary-border hover:border-primary/40 hover:text-foreground transition-all active:scale-95"
            >
              <Share2 className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </button>
            {isUserCustom && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-full border-[#6b7c3d]/40 text-[#6b7c3d] hover:bg-[#6b7c3d]/10"
                  onClick={() => setEditSheetOpen(true)}
                  aria-label="Редактировать"
                >
                  <Pencil className="h-4 w-4 shrink-0" />
                  <span className="text-typo-caption sm:text-typo-muted">Редактировать</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-full border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={isDeleting}
                  aria-label="Удалить рецепт"
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span className="text-typo-caption sm:text-typo-muted">Удалить</span>
                </Button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Порции:</span>
            <select
              value={servingsSelected}
              onChange={(e) => setServingsSelected(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
              aria-label="Количество порций"
            >
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <IngredientChips
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
            <ChefAdviceCard title="Совет от шефа" body={chefAdvice.trim()} isChefTip />
          ) : advice?.trim() ? (
            <ChefAdviceCard title="Мини-совет" body={advice.trim()} isChefTip={false} />
          ) : null}

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

          <RecipeSteps steps={steps} />
          </div>
        </div>
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
