import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { PROFILE_FIRST_CHILD_ONBOARDING } from "@/utils/firstChildOnboarding";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { saveOnboardingAttribution } from "@/utils/onboardingAttribution";
import { trackLandingEvent } from "@/utils/landingAnalytics";
import { trackPaywallTextShown } from "@/utils/paywallTextAnalytics";
import { WelcomeRecipeBlock } from "@/components/landing/WelcomeRecipeBlock";
import { WELCOME_LANDING_DEMO_RECIPE } from "@/data/welcomeLandingDemoRecipe";
import { HAS_SEEN_WELCOME_KEY } from "@/utils/navigation";

const BENEFIT_CARDS = [
  {
    title: "Ребёнок не ест?",
    text: "Подбираем блюда, которые дети принимают легче",
  },
  {
    title: "Не нужно готовить отдельно",
    text: "Один план питания для всей семьи",
  },
  {
    title: "Учитываем особенности ребёнка",
    text: "Возраст, аллергии и вкусовые предпочтения",
  },
];

export default function LandingOnboardingScreen() {
  const { user, loading } = useAuth();
  const { members, isLoading: isMembersLoading } = useFamily();
  const navigate = useNavigate();
  const location = useLocation();
  const landingDemoSectionSeenRef = useRef(false);
  const landingPaywallTextSentRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(HAS_SEEN_WELCOME_KEY, "true");
  }, []);

  const onDemoSectionBecameVisible = useCallback(() => {
    landingDemoSectionSeenRef.current = true;
  }, []);

  useEffect(() => {
    if (user) return;
    saveOnboardingAttribution(location.pathname, location.search);
    trackLandingEvent("landing_view");
  }, [user, location.pathname, location.search]);

  useEffect(() => {
    if (loading || user) return;
    if (landingPaywallTextSentRef.current) return;
    landingPaywallTextSentRef.current = true;
    trackPaywallTextShown("landing_example_recipe", {
      surface: "landing_example_recipe",
      properties: { entry_point: "landing" },
    });
  }, [loading, user]);

  /** Атрибуция (share_ref и т.д.) + опционально `mode=signup` только для CTA регистрации. */
  const buildAuthParams = (opts: { signup: boolean }): string => {
    const params = new URLSearchParams(location.search);
    const entryPoint = params.get("entry_point");
    const shareRef = params.get("share_ref");
    const shareType = params.get("share_type");
    const next = new URLSearchParams();
    if (opts.signup) {
      next.set("mode", "signup");
    }
    if (entryPoint) next.set("entry_point", entryPoint);
    if (shareRef) next.set("share_ref", shareRef);
    if (shareType) next.set("share_type", shareType);
    return next.toString();
  };

  const goToAuth = () => {
    trackLandingEvent("landing_cta_login_click");
    const search = buildAuthParams({ signup: false });
    navigate(search ? `/auth?${search}` : "/auth", { replace: true });
  };

  const goToFreeCta = () => {
    if (landingDemoSectionSeenRef.current) {
      trackLandingEvent("landing_demo_save_click");
    }
    trackLandingEvent("landing_cta_free_click");
    const search = buildAuthParams({ signup: true });
    navigate(search ? `/auth?${search}` : "/auth", { replace: true, state: { tab: "signup" } });
  };

  if (loading) {
    return (
      <div className="min-h-screen min-h-dvh flex items-center justify-center gradient-hero">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (user) {
    if (isMembersLoading) {
      return (
        <div className="min-h-screen min-h-dvh flex items-center justify-center gradient-hero">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Загрузка...</p>
          </div>
        </div>
      );
    }
    const to = members.length === 0 ? PROFILE_FIRST_CHILD_ONBOARDING : "/meal-plan";
    return <Navigate to={to} replace />;
  }

  return (
    <div
      className="min-h-screen min-h-dvh bg-background"
      style={{
        background: "var(--gradient-hero)",
      }}
    >
      <main className="max-w-md mx-auto w-full px-4 py-6 pb-12">
        {/* A) HERO — максимум 2 строки */}
        <section className="text-center mb-6">
          <h1 className="text-2xl sm:text-[1.75rem] font-semibold tracking-tight text-foreground">
            MomRecipes 🌿
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-muted-foreground text-balance">
            Меню для ребёнка за пару минут
          </p>
        </section>

        {/* B) Карточки: заголовок + одна короткая строка */}
        <section className="grid gap-3 mb-6">
          {BENEFIT_CARDS.map((card) => (
            <div
              key={card.title}
              className="rounded-2xl bg-primary/5 border border-primary/10 p-4 shadow-sm flex flex-col min-h-[5.5rem] justify-center"
            >
              <p className="text-[15px] sm:text-base font-semibold text-foreground leading-tight text-balance">
                {card.title}
              </p>
              <p className="text-[13px] sm:text-sm text-muted-foreground mt-1.5 leading-[1.35] text-pretty">
                {card.text}
              </p>
            </div>
          ))}
        </section>

        {/* C) CTA */}
        <section className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
          <Button
            className="rounded-xl h-14 min-h-[3.5rem] px-6 text-base font-semibold shadow-sm"
            onClick={goToFreeCta}
          >
            Получить свой план
          </Button>
          <Button
            variant="outline"
            className="rounded-xl h-14 min-h-[3.5rem] px-6 font-semibold border-2 border-primary/30 bg-transparent"
            onClick={goToAuth}
          >
            Войти
          </Button>
        </section>

        {/* D) Пример рецепта */}
        <section aria-labelledby="welcome-recipe-title" className="mt-2">
          <h2 id="welcome-recipe-title" className="text-base font-semibold text-foreground mb-3">
            Как выглядит рецепт в приложении
          </h2>
          <WelcomeRecipeBlock
            recipe={WELCOME_LANDING_DEMO_RECIPE}
            isLoading={false}
            onLandingDemoRecipeShown={() => trackLandingEvent("landing_demo_open")}
            onLandingDemoSectionVisible={onDemoSectionBecameVisible}
          />
        </section>

        {/* E) Финальный CTA */}
        <section className="mb-6 mt-8">
          <div className="rounded-2xl bg-muted/40 border border-border/60 px-4 py-4">
            <p className="text-base font-semibold text-foreground mb-2">
              Хочется перестать каждый день думать о еде?
            </p>
            <p className="text-sm text-muted-foreground mb-3 whitespace-pre-line">
              Мы составим меню за вас — с учётом именно вашего ребёнка 👶
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground mb-4">
              <li className="flex items-start gap-2">
                <span className="shrink-0">✔</span>
                <span>с учётом возраста</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0">✔</span>
                <span>без аллергенов</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0">✔</span>
                <span>без нелюбимых продуктов</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0">✔</span>
                <span>с блюдами, которые реально едят дети</span>
              </li>
            </ul>
            <Button
              className="w-full rounded-xl h-14 text-base font-semibold"
              onClick={goToFreeCta}
            >
              Получить свой план
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
