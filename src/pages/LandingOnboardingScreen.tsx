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
    emoji: "",
    title: "Ребёнок отказывается есть? 🙈",
    text: "Мы подберём блюда, которые дети принимают охотнее — без уговоров и стресса",
  },
  {
    emoji: "",
    title: "Не хочется готовить отдельно? 🍽",
    text: "Готовый план питания на день — для ребёнка и всей семьи\nБез лишней готовки и раздумий",
  },
  {
    emoji: "",
    title: "У каждого ребёнка свои особенности 💬",
    text: "Учтём возраст, аллергии и вкусы\nИ исключим то, что ребёнок не ест ✔",
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

  const buildAuthParams = (): string => {
    const params = new URLSearchParams(location.search);
    const entryPoint = params.get("entry_point");
    const shareRef = params.get("share_ref");
    const shareType = params.get("share_type");
    const next = new URLSearchParams();
    next.set("mode", "signup");
    if (entryPoint) next.set("entry_point", entryPoint);
    if (shareRef) next.set("share_ref", shareRef);
    if (shareType) next.set("share_type", shareType);
    return next.toString();
  };

  const goToAuth = () => {
    trackLandingEvent("landing_cta_login_click");
    const search = buildAuthParams();
    navigate(search ? `/auth?${search}` : "/auth", { replace: true });
  };

  const goToFreeCta = () => {
    if (landingDemoSectionSeenRef.current) {
      trackLandingEvent("landing_demo_save_click");
    }
    trackLandingEvent("landing_cta_free_click");
    const search = buildAuthParams();
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
      <main className="max-w-md mx-auto w-full px-4 py-8 pb-14">
        {/* A) HERO */}
        <section className="text-center mb-10">
          <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mb-2">
            MomRecipes 🌿
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground leading-snug mb-2">
            Спокойствие за питание ребёнка — каждый день
          </h1>
          <p className="text-lg sm:text-xl font-medium text-foreground/95 leading-snug mb-2">
            Не нужно думать, что приготовить — мы уже всё продумали за вас ✔
          </p>
          <p className="text-sm sm:text-base text-muted-foreground mb-8">
            Меню, рецепты и советы — за пару минут
          </p>
        </section>

        {/* B) 3 карточки преимуществ */}
        <section className="space-y-4 mb-12">
          {BENEFIT_CARDS.map((card) => (
            <div
              key={card.title}
              className="rounded-2xl bg-primary/5 border border-primary/10 px-4 py-4 shadow-sm"
            >
              <div className="flex gap-3 items-start">
                {card.emoji ? (
                  <span className="text-2xl shrink-0" aria-hidden>
                    {card.emoji}
                  </span>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{card.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-line">
                    {card.text}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* C) CTA row */}
        <section className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
          <Button
            className="rounded-xl h-12 px-6 font-semibold"
            onClick={goToFreeCta}
          >
            Получить свой план
          </Button>
          <Button
            variant="outline"
            className="rounded-xl h-12 px-6 font-semibold border-2 border-primary/30 bg-transparent"
            onClick={goToAuth}
          >
            Войти
          </Button>
        </section>

        {/* D) Пример рецепта в приложении */}
        <section aria-labelledby="welcome-recipe-title">
          <h2 id="welcome-recipe-title" className="text-lg font-semibold text-foreground mb-3">
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
        <section className="mb-6">
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
              className="w-full rounded-xl h-14 text-base font-semibold mb-3"
              onClick={goToFreeCta}
            >
              Получить свой план
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Можно остаться на бесплатной версии
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
