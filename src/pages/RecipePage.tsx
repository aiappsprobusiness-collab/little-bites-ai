import { useParams, useNavigate, useLocation } from "react-router-dom";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Loader2, ArrowLeft } from "lucide-react";
import { useRecipes } from "@/hooks/useRecipes";
import { Button } from "@/components/ui/button";
import type { IngredientItem, RecipeDisplayIngredients } from "@/types/recipe";

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
    const o = item as { name?: string; amount?: number | null; unit?: string | null; note?: string };
    return {
      name: o.name ?? "",
      amount: o.amount ?? undefined,
      unit: o.unit ?? undefined,
      note: o.note ?? undefined,
    };
  });
}

/** Строка количества для UI: amount + unit или note. */
function formatQuantity(ing: IngredientItem): string | null {
  if (ing.note) return ing.note;
  if (ing.amount != null && ing.unit) return `${ing.amount} ${ing.unit}`;
  if (ing.amount != null) return String(ing.amount);
  return null;
}

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { getRecipeById } = useRecipes();
  const { data: recipe, isLoading, error } = getRecipeById(id || "");
  const fromMealPlan = (location.state as { fromMealPlan?: boolean; mealTypeLabel?: string } | null)?.fromMealPlan;
  const mealTypeLabel = (location.state as { mealTypeLabel?: string } | null)?.mealTypeLabel;

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
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={() => (fromMealPlan ? navigate("/meal-plan") : navigate("/home"))}>
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
    cooking_time_minutes?: number | null;
    min_age_months?: number | null;
  };
  const displayIngredients = getDisplayIngredients(recipeDisplay);
  const steps = recipeDisplay.steps ?? [];
  const chefAdvice = recipeDisplay.chefAdvice;
  const cookingTime = recipeDisplay.cooking_time_minutes;
  const minAgeMonths = recipeDisplay.min_age_months;
  const description = recipeDisplay.description;

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
              <span className="inline-block text-typo-caption sm:text-typo-muted font-medium text-emerald-700 bg-emerald-50/80 border border-emerald-100 rounded-full px-2.5 py-0.5 sm:px-3 sm:py-1">
                {mealStr}
              </span>
            )}
            <h1 className="text-typo-body sm:text-typo-title font-semibold leading-snug text-[#2D3436]">
              {recipe.title}
            </h1>
          </section>

          {/* Польза для ребёнка */}
          {description && description.trim() !== "" && (
            <section className="mb-3 sm:mb-4">
              <p className="text-typo-caption sm:text-typo-muted font-medium text-muted-foreground mb-0.5 sm:mb-1">Польза для ребёнка</p>
              <p className="text-typo-caption sm:text-typo-muted text-muted-foreground leading-relaxed">{description.trim()}</p>
            </section>
          )}

          {/* Ингредиенты — пилюли как в чате (olive/mint) */}
          {displayIngredients.length > 0 && (
            <section className="mb-3 sm:mb-4">
              <p className="text-typo-caption sm:text-typo-muted font-medium text-muted-foreground mb-1.5 sm:mb-2">Ингредиенты</p>
              <div className="flex flex-wrap gap-2">
                {displayIngredients.map((ing, index) => {
                  const qty = formatQuantity(ing);
                  const label = qty != null ? `${ing.name} — ${qty}` : ing.name;
                  return (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1.5 sm:gap-2 bg-[#F1F5E9]/60 border border-[#6B8E23]/10 rounded-full px-2 py-1 sm:px-3 sm:py-1.5"
                    >
                      <span className="text-[#2D3436] font-medium text-typo-caption sm:text-typo-muted min-w-0 truncate max-w-[200px]">{label}</span>
                    </span>
                  );
                })}
              </div>
            </section>
          )}

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
                      <span className="text-typo-caption font-bold text-[#6B8E23] shrink-0">{num}.</span>
                      <p className="text-typo-caption sm:text-typo-muted text-[#2D3436] leading-relaxed flex-1 min-w-0">
                        {step.instruction ?? ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Совет от шефа — блок как в чате */}
          {chefAdvice && (
            <div className="rounded-xl sm:rounded-2xl p-3 sm:p-4 bg-emerald-50/60 border border-emerald-100/80 flex gap-2 sm:gap-3 items-start">
              <span className="text-typo-title shrink-0" aria-hidden>👨‍🍳</span>
              <div className="min-w-0">
                <p className="text-typo-caption font-medium text-emerald-800/90 mb-0.5">Совет от шефа</p>
                <p className="text-typo-caption sm:text-typo-muted text-[#2D3436] leading-snug">{chefAdvice}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
