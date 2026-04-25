import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RecipeCard } from "@/components/recipe/RecipeCard";
import { Check, Leaf, Loader2 } from "lucide-react";
import { saveOnboardingAttribution } from "@/utils/onboardingAttribution";
import { trackLandingEvent } from "@/utils/landingAnalytics";
import { getAnalyticsPlatform } from "@/utils/analyticsPlatform";
import { invokeVkPreviewPlan } from "@/api/vkPreviewPlan";
import type { DayPlan, MealSlot, VkPreviewMeal } from "@/types/vkFunnel";
import { ensureVkSessionId, readVkDraftRaw, saveVkDraft, updateVkDraftPreview } from "@/utils/vkDraft";
import { cn } from "@/lib/utils";
import { getBenefitLabel } from "@/utils/ageCategory";
import { buildRecipeBenefitDescription } from "@/utils/recipeBenefitDescription";

const AGE_PRESETS: { label: string; months: number }[] = [
  { label: "6–11 мес", months: 9 },
  { label: "1–2 года", months: 18 },
  { label: "2–3 года", months: 30 },
  { label: "3–5 лет", months: 48 },
  { label: "6–9 лет", months: 84 },
  { label: "10–12 лет", months: 132 },
  { label: "13–18 лет", months: 192 },
];

const ALLERGY_OPTIONS = ["бкм", "орехи", "арахис", "яйца", "рыба", "глютен", "лактоза", "соя", "мёд", "кунжут"];

const LIKE_OPTIONS = ["овощи", "фрукты", "мясо", "рыба", "крупы", "молочное", "супы", "запеканки", "паста"];

const DISLIKE_OPTIONS = ["овощи", "рыба", "мясо", "молочное", "крупы", "супы", "острое", "грибы", "бобовые"];

const HERO_BENEFIT_LINES = [
  "Возраст — порции и текстура под малыша",
  "Аллергии — не окажутся в меню на день",
  "Вкусы — что нравится и что не ест",
];

type Step = "hero" | 1 | 2 | 3 | "loading" | "result";

const MEAL_LABEL: Record<MealSlot, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

/**
 * Превью блюда: верхний блок как на странице рецепта — КБЖУ (`details`), строка «Польза для…» с 🌿,
 * описание (из API или детерминированный fallback), чипсы целей как на деталке.
 */
function VkPreviewRecipeCard({
  meal,
  ageMonths,
  vkSessionId,
}: {
  meal: VkPreviewMeal;
  ageMonths: number;
  vkSessionId: string;
}) {
  const nutrition =
    meal.calories != null || meal.protein != null || meal.fat != null || meal.carbs != null
      ? {
          calories: meal.calories ?? null,
          proteins: meal.protein ?? null,
          fats: meal.fat ?? null,
          carbs: meal.carbs ?? null,
        }
      : null;

  const canonical = (meal.description ?? "").trim();
  const fallbackDescription = buildRecipeBenefitDescription({
    recipeId: null,
    stableKey: `${vkSessionId}:${meal.type}:${meal.title}`,
    goals: meal.nutrition_goals ?? [],
    title: meal.title,
  });
  const headerDescription = canonical.length > 0 ? canonical : fallbackDescription;
  const benefitLabel = getBenefitLabel(ageMonths);

  return (
    <RecipeCard
      variant="preview"
      previewPresentation="collection"
      previewNutritionGoalsLoud
      header={{
        mealLabel: MEAL_LABEL[meal.type],
        cookingTimeMinutes: meal.cooking_time_minutes ?? null,
        title: meal.title,
        benefitLabel,
        description: headerDescription,
        nutritionHeaderVariant: "details",
        nutritionToneOverride: "default",
      }}
      ingredients={[]}
      showIngredientChips={false}
      showHint={false}
      nutrition={nutrition}
      nutritionGoals={meal.nutrition_goals ?? []}
      nutritionGoalsMaxVisible={3}
    />
  );
}

function toggleInList(list: string[], v: string, max: number): string[] {
  const t = v.trim().toLowerCase();
  const has = list.some((x) => x.toLowerCase() === t);
  if (has) return list.filter((x) => x.toLowerCase() !== t);
  if (list.length >= max) return list;
  return [...list, v];
}

export default function VkFunnelPage() {
  const { user, loading } = useAuth();
  const { members, isLoading: membersLoading } = useFamily();
  const navigate = useNavigate();
  const location = useLocation();
  const landingSent = useRef(false);
  const [step, setStep] = useState<Step>("hero");
  const [ageMonths, setAgeMonths] = useState(24);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [likes, setLikes] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const vkSessionId = useMemo(() => ensureVkSessionId(readVkDraftRaw()), []);

  const persistDraft = useCallback(() => {
    saveVkDraft({
      vk_session_id: vkSessionId,
      age_months: ageMonths,
      allergies,
      likes,
      dislikes,
    });
  }, [vkSessionId, ageMonths, allergies, likes, dislikes]);

  useEffect(() => {
    if (user) return;
    try {
      localStorage.setItem("last_touch_entry_point", "vk");
    } catch {
      /* ignore */
    }
    saveOnboardingAttribution(location.pathname, location.search);
    if (landingSent.current) return;
    landingSent.current = true;
    trackLandingEvent("vk_landing_view", {
      entry_point: "vk",
      platform: getAnalyticsPlatform(),
      vk_session_id: vkSessionId,
      step: "hero",
    });
  }, [user, location.pathname, location.search, vkSessionId]);

  useEffect(() => {
    persistDraft();
  }, [persistDraft]);

  const trackVk = useCallback(
    (feature: string, extra?: Record<string, unknown>) => {
      trackLandingEvent(feature, {
        entry_point: "vk",
        platform: getAnalyticsPlatform(),
        vk_session_id: vkSessionId,
        ...extra,
      });
    },
    [vkSessionId],
  );

  const runPreview = useCallback(async () => {
    setLoadError(null);
    setStep("loading");
    trackVk("vk_complete_onboarding", { step: "3" });
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const utm: Record<string, string> = {};
    const sp = new URLSearchParams(location.search);
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      const v = sp.get(k);
      if (v) utm[k] = v;
    }
    try {
      const res = await invokeVkPreviewPlan(
        {
          age_months: ageMonths,
          allergies,
          likes,
          dislikes,
          entry_point: "vk",
          ...(Object.keys(utm).length ? { utm } : {}),
        },
        abortRef.current.signal,
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        day_plan?: DayPlan;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.day_plan) {
        setLoadError(json.error ?? "Не удалось составить меню");
        setStep("result");
        return;
      }
      setPlan(json.day_plan);
      updateVkDraftPreview(json.day_plan);
      trackVk("vk_plan_generated", {
        step: "result",
        fallback_source: json.day_plan.meta.fallback_source,
        duration_ms: json.day_plan.meta.duration_ms,
        has_preview: true,
      });
      setStep("result");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setLoadError("Сеть недоступна. Попробуйте ещё раз.");
      setStep("result");
    }
  }, [ageMonths, allergies, dislikes, likes, location.search, trackVk]);

  const goAuthSignup = useCallback(async () => {
    persistDraft();
    const params = new URLSearchParams();
    params.set("mode", "signup");
    params.set("entry_point", "vk");
    const cur = new URLSearchParams(location.search);
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      const v = cur.get(k);
      if (v) params.set(k, v);
    }
    const { trackUsageEventAwait } = await import("@/utils/usageEvents");
    await trackUsageEventAwait("vk_click_get_full_plan", {
      properties: {
        entry_point: "vk",
        platform: getAnalyticsPlatform(),
        vk_session_id: vkSessionId,
        step: "result",
        has_preview: Boolean(plan?.meals?.length),
      },
    });
    navigate(`/auth?${params.toString()}`, { state: { tab: "signup" } });
  }, [navigate, location.search, persistDraft, plan?.meals?.length, vkSessionId]);

  if (loading || membersLoading) {
    return (
      <div className="min-h-screen min-h-dvh flex items-center justify-center auth-page-bg">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    const to = members.length === 0 ? "/profile?openCreateProfile=1&welcome=1" : "/meal-plan";
    return <Navigate to={to} replace />;
  }

  const chipClass = (on: boolean) =>
    cn(
      "rounded-full px-3 py-2 text-sm font-medium border transition-colors touch-manipulation",
      on ? "bg-primary text-primary-foreground border-primary" : "bg-background/80 border-border hover:border-primary/50",
    );

  return (
    <div className="min-h-screen min-h-dvh flex flex-col auth-page-bg pb-safe">
      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-5 sm:pt-8 pb-10 flex flex-col gap-6">
        {step === "hero" ? (
          <div className="flex flex-col gap-5 w-full">
            <div className="text-center space-y-1 px-1">
              <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">MomRecipes 🌿</p>
              <p className="text-base sm:text-lg font-medium text-foreground/90 leading-snug text-balance">
                Меню для ребёнка — за 1 минуту
              </p>
            </div>
            <Card className="backdrop-blur-xl rounded-[28px] sm:rounded-[32px] bg-card/95 text-card-foreground border border-border/40 shadow-card dark:bg-card/92 dark:border-white/10 dark:shadow-[0_24px_48px_-28px_rgba(0,0,0,0.85)]">
              <CardContent className="px-4 sm:px-6 pt-6 sm:pt-6 pb-6 space-y-5">
                <div className="text-center space-y-3">
                  <h1 className="text-2xl sm:text-[1.6rem] font-bold text-balance leading-tight">
                    Получите меню для ребёнка на день за 10 секунд
                  </h1>
                  <p className="text-muted-foreground text-base leading-snug">
                    С учётом возраста, аллергий и предпочтений
                  </p>
                </div>
                <ul className="space-y-2.5 text-sm text-foreground/85 dark:text-foreground/80">
                  {HERO_BENEFIT_LINES.map((line) => (
                    <li key={line} className="flex gap-2.5 items-start text-left">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                        aria-hidden
                      >
                        <Check className="h-3 w-3 stroke-[2.5]" />
                      </span>
                      <span className="leading-snug pt-0.5">{line}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full h-14 text-base font-semibold rounded-2xl shadow-button"
                  onClick={() => {
                    trackVk("vk_start_onboarding", { step: "hero" });
                    setStep(1);
                  }}
                >
                  Составить меню
                </Button>
              </CardContent>
            </Card>
            <div className="flex flex-col items-center gap-1 text-primary/25 dark:text-primary/30" aria-hidden>
              <Leaf className="w-9 h-9" strokeWidth={1.25} />
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <section className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">1/3 · Возраст</p>
            <h2 className="text-xl font-semibold text-center">Сколько месяцев ребёнку?</h2>
            <div className="flex flex-wrap gap-2 justify-center">
              {AGE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={chipClass(ageMonths === p.months)}
                  onClick={() => setAgeMonths(p.months)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button className="w-full h-12 rounded-2xl" onClick={() => setStep(2)}>
              Далее
            </Button>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">2/3 · Аллергии</p>
            <h2 className="text-xl font-semibold text-center">Есть аллергии?</h2>
            <p className="text-xs text-muted-foreground text-center">Можно несколько</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {ALLERGY_OPTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={chipClass(allergies.some((x) => x.toLowerCase() === a))}
                  onClick={() => setAllergies((prev) => toggleInList(prev, a, 20))}
                >
                  {a}
                </button>
              ))}
            </div>
            <Button className="w-full h-12 rounded-2xl" onClick={() => setStep(3)}>
              Далее
            </Button>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">3/3 · Вкусы</p>
            <h2 className="text-xl font-semibold text-center">Что любит и что не ест?</h2>
            <div>
              <p className="text-sm font-medium mb-2">Нравится</p>
              <div className="flex flex-wrap gap-2">
                {LIKE_OPTIONS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={chipClass(likes.some((x) => x.toLowerCase() === a))}
                    onClick={() => setLikes((prev) => toggleInList(prev, a, 30))}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Не любит</p>
              <div className="flex flex-wrap gap-2">
                {DISLIKE_OPTIONS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={chipClass(dislikes.some((x) => x.toLowerCase() === a))}
                    onClick={() => setDislikes((prev) => toggleInList(prev, a, 30))}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full h-12 rounded-2xl" onClick={() => void runPreview()}>
              Показать меню
            </Button>
          </section>
        ) : null}

        {step === "loading" ? (
          <section className="space-y-4 flex-1">
            <p className="text-center font-medium">Подбираем меню...</p>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </section>
        ) : null}

        {step === "result" ? (
          <section className="space-y-6 flex-1">
            <h2 className="text-xl font-semibold text-center">Меню на сегодня</h2>
            {loadError ? (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-center space-y-3">
                <p className="text-sm">{loadError}</p>
                <Button variant="outline" className="rounded-xl" onClick={() => void runPreview()}>
                  Повторить
                </Button>
              </div>
            ) : null}
            {plan?.meals?.length ? (
              <div className="space-y-3">
                {plan.meals.map((m) => (
                  <VkPreviewRecipeCard key={m.type} meal={m} ageMonths={ageMonths} vkSessionId={vkSessionId} />
                ))}
              </div>
            ) : null}
            {!loadError && !plan?.meals?.length ? (
              <p className="text-sm text-muted-foreground text-center">Пока пусто — попробуйте снова.</p>
            ) : null}
            <div className="rounded-2xl border bg-card/90 p-5 space-y-3 text-center">
              <p className="font-semibold text-lg">Хотите полный план на неделю?</p>
              <p className="text-sm text-muted-foreground">С учётом вашего ребёнка</p>
              <Button className="w-full h-12 rounded-2xl font-semibold" onClick={() => void goAuthSignup()}>
                Получить полный план
              </Button>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
