import { useState, useEffect } from "react";
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
import { ingredientDisplayLabel } from "@/types/recipe";
import { buildRecipeShareText } from "@/utils/shareRecipeText";
import { IngredientSubstituteSheet } from "@/components/recipe/IngredientSubstituteSheet";
import { AddToPlanSheet } from "@/components/plan/AddToPlanSheet";
import { MyRecipeFormSheet } from "@/components/favorites/MyRecipeFormSheet";
import { useFamily } from "@/contexts/FamilyContext";
import { useAppStore } from "@/store/useAppStore";
import { getBenefitLabel } from "@/utils/ageCategory";
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
  };
  const isUserCustom = recipeDisplay.source === "user_custom";
  const displayIngredients = getDisplayIngredients(recipeDisplay);
  const steps = recipeDisplay.steps ?? [];
  const chefAdvice = recipeDisplay.chefAdvice ?? (recipeDisplay as { chef_advice?: string | null }).chef_advice;
  const advice = recipeDisplay.advice ?? (recipeDisplay as { advice?: string | null }).advice;
  const cookingTime = recipeDisplay.cooking_time_minutes;
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
      <div className="px-4 pb-6 max-w-[100%] mx-auto">
        {/* Карточка рецепта — те же стили, что и в чате */}
        <div className="bg-white rounded-2xl sm:rounded-[28px] px-3 py-3 sm:px-6 sm:py-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-100/80 space-y-4 sm:space-y-5">
          {/* Тип приёма пищи + заголовок */}
          <section className="space-y-1.5 sm:space-y-2">
            {mealStr && (
              <span className="inline-block text-typo-caption sm:text-typo-muted font-medium text-primary bg-primary-light border border-primary-border rounded-full px-2.5 py-0.5 sm:px-3 sm:py-1">
                {mealStr}
              </span>
            )}
            <h1 className="text-typo-body sm:text-typo-title font-semibold leading-snug text-[#2D3436]">
              {recipe.title}
            </h1>
          </section>

          {/* Действия: Добавить в план, Лайк, Поделиться — внутри карточки, единый стиль с чатом */}
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
                  : "text-muted-foreground bg-slate-50/50 border-slate-200/40 hover:border-slate-200/60 hover:text-slate-500"
              }`}
            >
              <Heart className={`h-4 w-4 sm:h-4.5 sm:w-4.5 ${isFavorite ? "fill-current" : ""}`} />
            </button>
            <button
              type="button"
              onClick={handleShare}
              aria-label="Поделиться"
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-full shrink-0 flex items-center justify-center text-muted-foreground bg-slate-50/50 border border-slate-200/40 hover:border-slate-200/60 hover:text-slate-500 transition-all active:scale-95"
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

          {description && description.trim() !== "" && (
            <section className="mb-3 sm:mb-4">
              <p className="text-typo-caption sm:text-typo-muted font-medium text-muted-foreground mb-0.5 sm:mb-1">{getBenefitLabel(selectedMember?.age_months ?? undefined)}</p>
              <p className="text-typo-caption sm:text-typo-muted text-muted-foreground leading-relaxed">{description.trim()}</p>
            </section>
          )}

          {/* Ингредиенты — пилюли как в чате (olive/mint) + кнопка замены */}
          {displayIngredients.length > 0 && (
            <section className="mb-3 sm:mb-4">
              <p className="text-typo-caption sm:text-typo-muted font-medium text-muted-foreground mb-1.5 sm:mb-2">Ингредиенты</p>
              <div className="flex flex-wrap gap-2">
                {displayIngredients.map((ing, index) => {
                  const baseLabel = ingredientDisplayLabel(ing);
                  const label = (overrides[index] ?? baseLabel) || "Ингредиент";
                  return (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1.5 sm:gap-2 bg-primary-light/80 border border-primary-border rounded-full px-2 py-1 sm:px-3 sm:py-1.5 max-w-full"
                    >
                      <span className="text-[#2D3436] font-medium text-typo-caption sm:text-typo-muted min-w-0 max-w-full truncate whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (isFree) {
                            setPaywallCustomMessage("Замена ингредиентов доступна в Premium. Попробуйте Trial или оформите подписку.");
                            setShowPaywall(true);
                          } else {
                            setSubstituteSheet({ open: true, index, ing });
                          }
                        }}
                        className="shrink-0 p-0.5 rounded-full hover:bg-primary/15 text-primary touch-manipulation"
                        aria-label={isFree ? "Замена ингредиента доступна в Premium" : `Заменить: ${ing.name}`}
                      >
                        {isFree ? <Lock className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      </button>
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {/* Совет: только один блок — chefAdvice или advice (после Ингредиенты, перед Приготовлением) */}
          {chefAdvice?.trim() ? (
            <div className="rounded-xl sm:rounded-2xl p-3 sm:p-4 bg-primary-light/80 border border-primary-border flex gap-2 sm:gap-3 items-start">
              <span className="text-typo-title shrink-0" aria-hidden>👨‍🍳</span>
              <div className="min-w-0">
                <p className="text-typo-caption font-medium text-primary mb-0.5">Совет от шефа</p>
                <p className="text-typo-caption sm:text-typo-muted text-[#2D3436] leading-snug">{chefAdvice.trim()}</p>
              </div>
            </div>
          ) : advice?.trim() ? (
            <div className="rounded-xl sm:rounded-2xl p-3 sm:p-4 bg-slate-50/80 border border-slate-200/60 flex gap-2 sm:gap-3 items-start">
              <span className="text-typo-title shrink-0" aria-hidden>💡</span>
              <div className="min-w-0">
                <p className="text-typo-caption font-medium text-slate-600 mb-0.5">Мини-совет</p>
                <p className="text-typo-caption sm:text-typo-muted text-[#2D3436] leading-snug">{advice.trim()}</p>
              </div>
            </div>
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

          {/* Время приготовления — как в чате */}
          {timeStr && (
            <p className="text-typo-caption text-muted-foreground mb-3 sm:mb-4">⏱️ {timeStr}</p>
          )}

          {/* Приготовление — нумерация и отступы как в чате */}
          {steps.length > 0 && (
            <section>
              <p className="text-typo-caption sm:text-typo-muted font-medium text-muted-foreground mb-1.5 sm:mb-2">Приготовление</p>
              <div className="space-y-1.5 sm:space-y-2">
                {steps.map((step: { instruction?: string; step_number?: number }, index: number) => {
                  const num = step.step_number ?? index + 1;
                  return (
                    <div key={index} className="flex gap-2 sm:gap-3 items-start">
                      <span className="text-typo-caption font-bold text-primary shrink-0">{num}.</span>
                      <p className="text-typo-caption sm:text-typo-muted text-[#2D3436] leading-relaxed flex-1 min-w-0">
                        {step.instruction ?? ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
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
