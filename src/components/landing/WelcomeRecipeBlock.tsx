import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useRecipes } from "@/hooks/useRecipes";
import type { IngredientItem, RecipeDisplayIngredients } from "@/types/recipe";
import { getMealLabel } from "@/data/mealLabels";
import { getBenefitLabel } from "@/utils/ageCategory";
import { buildRecipeBenefitDescription } from "@/utils/recipeBenefitDescription";
import { recipeHeroCard } from "@/theme/recipeTokens";
import { RecipeIngredientList } from "@/components/recipe/RecipeIngredientList";
import { ChefAdviceCard } from "@/components/recipe/ChefAdviceCard";
import { RecipeSteps } from "@/components/recipe/RecipeSteps";
import { RecipeNutritionHeader } from "@/components/recipe/RecipeNutritionHeader";
import { NutritionGoalsChips } from "@/components/recipe/NutritionGoalsChips";
import { cn } from "@/lib/utils";
import type { PublicRecipePayload } from "@/services/publicRecipeShare";
import { getChefAdviceCardPresentation, isInfantRecipe } from "@/utils/infantRecipe";
import { trackUsageEvent } from "@/utils/usageEvents";

const WELCOME_RECIPE_ID = "4dcaf358-5aea-4806-89c1-ffe02e96d8e3";

export interface WelcomeRecipeBlockProps {
  /** Передать рецепт для публичной страницы шаринга; иначе загружается демо-рецепт по WELCOME_RECIPE_ID */
  recipe?: PublicRecipePayload | null;
  /** Показывать лоадер (для публичной страницы, пока рецепт грузится) */
  isLoading?: boolean;
  /** Один раз: демо-рецепт с лендинга отрисован (landing_demo_open). */
  onLandingDemoRecipeShown?: () => void;
  /** Секция демо попала в viewport (для landing_demo_save_click при последующем CTA). */
  onLandingDemoSectionVisible?: () => void;
}

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
    };
    return {
      name: o.name ?? "",
      display_text: o.display_text ?? undefined,
      canonical_amount: o.canonical_amount ?? undefined,
      canonical_unit:
        o.canonical_unit === "g" || o.canonical_unit === "ml" ? o.canonical_unit : undefined,
      amount: o.amount ?? undefined,
      unit: o.unit ?? undefined,
      note: o.note ?? undefined,
      substitute: o.substitute ?? undefined,
    };
  });
}

/** Read-only recipe block for welcome: same look as in-app recipe (meal chip, time, calories, BJU, title, description, ingredients, chef advice, steps). Optional max-height + fade. */
export function WelcomeRecipeBlock({
  recipe: recipeProp,
  isLoading: isLoadingProp,
  onLandingDemoRecipeShown,
  onLandingDemoSectionVisible,
}: WelcomeRecipeBlockProps = {}) {
  const { getRecipeById } = useRecipes();
  const sectionRef = useRef<HTMLElement>(null);
  const demoOpenTrackedRef = useRef(false);
  const recipeViewTrackedRef = useRef(false);
  /** Не запрашивать демо из БД, если рецепт передан снаружи — иначе ошибка get_recipe_full у анона скрывала бы весь блок. */
  const welcomeFetchId = recipeProp === undefined ? WELCOME_RECIPE_ID : "";
  const { data: recipeFromHook, isLoading: isLoadingHook, error } = getRecipeById(welcomeFetchId);

  const useHookRecipe = recipeProp === undefined;
  const isLoading = useHookRecipe ? isLoadingHook : (isLoadingProp ?? false);
  const recipe = useHookRecipe ? recipeFromHook : recipeProp;

  useEffect(() => {
    if (!onLandingDemoRecipeShown || !recipe || demoOpenTrackedRef.current) return;
    demoOpenTrackedRef.current = true;
    onLandingDemoRecipeShown();
  }, [recipe, onLandingDemoRecipeShown]);

  /** Демо на лендинге: recipe_view только для внутренней загрузки WELCOME_RECIPE_ID (не /r/ страница). */
  useEffect(() => {
    if (!recipe || recipeProp !== undefined || recipeViewTrackedRef.current) return;
    const rid = (recipe as { id?: string }).id;
    if (!rid) return;
    recipeViewTrackedRef.current = true;
    trackUsageEvent("recipe_view", {
      properties: {
        recipe_id: rid,
        source: "welcome_demo",
        is_public: false,
      },
    });
  }, [recipe, recipeProp]);

  useEffect(() => {
    if (!onLandingDemoSectionVisible || !recipe) return;
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onLandingDemoSectionVisible();
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [recipe, onLandingDemoSectionVisible]);

  if (isLoading) {
    return (
      <section className="mb-10 flex min-h-[200px] items-center justify-center rounded-2xl border border-border/80 bg-card/50">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (recipeProp === null) return null;
  if (useHookRecipe && (error || !recipe)) return null;
  if (!useHookRecipe && !recipe) return null;

  const recipeDisplay = recipe as RecipeDisplayIngredients & {
    title?: string;
    description?: string;
    steps?: { instruction?: string; step_number?: number }[];
    chefAdvice?: string;
    advice?: string | null;
    cooking_time_minutes?: number | null;
    min_age_months?: number | null;
    max_age_months?: number | null;
    nutrition_goals?: string[] | null;
  };
  const mealType = (recipeDisplay as { meal_type?: string | null }).meal_type ?? null;
  const mealLabel = getMealLabel(mealType);
  const cookingTime = recipeDisplay.cooking_time_minutes;
  const minAgeMonths = recipeDisplay.min_age_months;
  const isInfant = isInfantRecipe({ max_age_months: recipeDisplay.max_age_months });
  const nutritionGoals = recipeDisplay.nutrition_goals ?? [];
  const benefitLabel = getBenefitLabel(minAgeMonths ?? undefined);
  const benefitLabelForDisplay = isInfant ? null : benefitLabel;
  /** Как на RecipePage: сначала каноническое description (БД / перевод из RPC), иначе benefit fallback. */
  const benefitDescription = buildRecipeBenefitDescription({
    recipeId: (recipe as { id?: string }).id ?? null,
    goals: nutritionGoals,
    title: recipeDisplay.title ?? "",
  });
  const dbDescription = (recipeDisplay.description ?? "").trim();
  const heroDescription = dbDescription.length > 0 ? dbDescription : benefitDescription;

  if (import.meta.env.DEV && recipeProp !== undefined) {
    const descriptionSource =
      dbDescription.length > 0 ? "db_or_translation" : "fallback_benefit";
    console.debug("[sharedRecipeHero]", {
      description_source: descriptionSource,
      used_benefit_fallback: dbDescription.length === 0,
      nutrition_goals_count: nutritionGoals.length,
    });
  }
  const steps = recipeDisplay.steps ?? [];
  const chefAdvice =
    recipeDisplay.chefAdvice ?? (recipeDisplay as { chef_advice?: string | null }).chef_advice;
  const advice = recipeDisplay.advice ?? (recipeDisplay as { advice?: string | null }).advice;

  const recipeNutrition =
    (recipe as { calories?: number | null }).calories != null ||
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

  const displayIngredients = getDisplayIngredients(recipe as RecipeDisplayIngredients);
  const welcomeServingsBase = Math.max(1, (recipe as { servings_base?: number | null }).servings_base ?? 1);
  const welcomeServingsRecommended =
    (recipe as { servings_recommended?: number | null }).servings_recommended ?? 4;

  const chefAdvicePresentation = getChefAdviceCardPresentation({
    recipe: { max_age_months: recipeDisplay.max_age_months },
    isChefTip: true,
  });
  const miniAdvicePresentation = getChefAdviceCardPresentation({
    recipe: { max_age_months: recipeDisplay.max_age_months },
    isChefTip: false,
  });

  return (
    <section ref={sectionRef} className="mb-10">
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden",
          "max-h-[65vh] min-h-0 flex flex-col"
        )}
      >
        <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 rounded-2xl border border-border/80 bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06),0_4px_16px_-6px_rgba(0,0,0,0.04)]">
          <div className={cn(recipeHeroCard, "relative space-y-4 p-6 rounded-2xl")}>
            <div className="space-y-4">
              <h3 className="text-typo-body sm:text-typo-title font-medium leading-snug text-foreground">
                {recipeDisplay.title ?? "Рецепт"}
              </h3>

              <RecipeNutritionHeader
                mealTypeLabel={mealLabel}
                cookingTimeMinutes={
                  typeof cookingTime === "number" ? cookingTime : null
                }
                nutrition={recipeNutrition}
                variant="details"
              />

              {benefitLabelForDisplay && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <span aria-hidden="true">🌿</span>
                  <span>{benefitLabelForDisplay}</span>
                </p>
              )}
              <p className="text-sm text-muted-foreground leading-[1.6]">
                {heroDescription}
              </p>
              <NutritionGoalsChips goals={nutritionGoals} className="mt-1" />
            </div>
          </div>

          <div className="px-4 pb-6 -mt-2">
            <RecipeIngredientList
              className="mt-4"
              ingredients={displayIngredients}
              ingredientServingMultiplier={welcomeServingsRecommended / welcomeServingsBase}
              servingsCount={welcomeServingsRecommended}
            />

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
        </div>

        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent rounded-b-2xl"
          aria-hidden
        />
      </div>
    </section>
  );
}
