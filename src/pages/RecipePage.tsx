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
          <Button variant="mint" onClick={() => (fromMealPlan ? navigate("/meal-plan") : navigate("/home"))}>
            {fromMealPlan ? "К плану питания" : "На главную"}
          </Button>
        </div>
      </MobileLayout>
    );
  }

  const recipeDisplay = recipe as RecipeDisplayIngredients & {
    title?: string;
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

  const ageStr = formatAge(minAgeMonths ?? null);
  const mealStr = mealTypeLabel ?? "";
  const timeStr = cookingTime != null ? `${cookingTime} мин` : "";
  const metaParts = [ageStr, mealStr, timeStr].filter(Boolean);
  const metaString = metaParts.length > 0 ? metaParts.join(" · ") : undefined;

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
      <div className="px-4 pb-6 space-y-6 max-w-[75ch] mx-auto">
        {/* Секция: заголовок (название блюда) + мета chip */}
        <section className="space-y-2">
          <h1 className="text-xl font-semibold text-slate-900 line-clamp-2 leading-tight">
            {recipe.title}
          </h1>
          {metaString && (
            <span className="inline-block rounded-full bg-emerald-50/80 px-3 py-1 text-sm text-slate-600">
              {metaString}
            </span>
          )}
        </section>

        {/* Секция: Ингредиенты — карточка, двухколоночный вид (название | количество) */}
        {displayIngredients.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Ингредиенты</h2>
            <div className="rounded-xl bg-emerald-50/50 p-4">
              <ul className="space-y-2.5 list-none p-0 m-0">
                {displayIngredients.map((ing, index) => {
                  const qty = formatQuantity(ing);
                  return (
                    <li key={index} className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-0.5 items-baseline text-sm leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 mt-1.5 shrink-0" aria-hidden />
                      <span className="min-w-0 text-slate-600">{ing.name}</span>
                      {qty != null ? (
                        <span className="text-xs text-slate-500 shrink-0 text-right">{qty}</span>
                      ) : (
                        <span />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

        {/* Секция: Приготовление — шаги с кружками */}
        {steps.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Приготовление</h2>
            <ol className="space-y-4 list-none p-0 m-0">
              {steps.map((step: { instruction?: string; step_number?: number }, index: number) => {
                const num = step.step_number ?? index + 1;
                return (
                  <li key={index} className="flex gap-3 items-start">
                    <span
                      className="shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold"
                      aria-hidden
                    >
                      {num}
                    </span>
                    <p className="text-sm text-slate-700 leading-relaxed pt-0.5 flex-1 min-w-0">
                      {step.instruction ?? ""}
                    </p>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* Совет шефа: мягкий блок без тяжёлых бордеров */}
        {chefAdvice && (
          <section>
            <div className="rounded-xl p-4 bg-emerald-50/40">
              <p className="font-semibold text-slate-700 text-sm mb-1.5">Совет шефа</p>
              <p className="text-sm text-slate-600 leading-relaxed">{chefAdvice}</p>
            </div>
          </section>
        )}
      </div>
    </MobileLayout>
  );
}
