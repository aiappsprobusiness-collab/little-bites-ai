import { useEffect, useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DemoRecipeSheet } from "@/components/landing/DemoRecipeSheet";
import { Loader2 } from "lucide-react";
import { saveOnboardingAttribution } from "@/utils/onboardingAttribution";
import { trackLandingEvent } from "@/utils/landingAnalytics";

const BENEFIT_CARDS = [
  {
    emoji: "👶",
    title: "Ребёнок не ест?",
    text: "Подскажем блюда, которые дети едят охотнее",
  },
  {
    emoji: "🍽",
    title: "Меню на каждый день",
    text: "Готовые блюда для всей семьи без отдельной готовки",
  },
  {
    emoji: "💬",
    title: "Можно спросить в любой момент",
    text: "Аллергии, прикорм, если ребёнок отказывается есть",
  },
];

const DEMO_MEALS = [
  { slot: "Завтрак", title: "Овсянка с бананом и корицей" },
  { slot: "Обед", title: "Суп с фрикадельками, салат" },
  { slot: "Полдник", title: "Творожная запеканка" },
  { slot: "Ужин", title: "Рыба с овощами на пару" },
];

export default function LandingOnboardingScreen() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    if (user) return;
    saveOnboardingAttribution(location.pathname, location.search);
    trackLandingEvent("landing_view");
  }, [user, location.pathname, location.search]);

  const openDemo = () => {
    trackLandingEvent("landing_demo_open");
    setDemoOpen(true);
  };

  const goToAuth = () => {
    navigate("/auth", { replace: true });
  };

  const goToFreeCta = () => {
    trackLandingEvent("landing_cta_free_click");
    navigate("/auth", { replace: true });
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

  if (user) return <Navigate to="/meal-plan" replace />;

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
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground leading-tight mb-3">
            MomRecipes
          </h1>
          <p className="text-xl sm:text-2xl font-medium text-foreground/95 leading-snug mb-2">
            Не думайте каждый день,
            <br />
            чем кормить ребёнка
          </p>
          <p className="text-base text-muted-foreground mb-8">
            Меню, рецепты и советы — за 1 минуту
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              className="rounded-xl h-12 px-6 font-semibold"
              onClick={openDemo}
            >
              Попробовать пример
            </Button>
            <Button
              variant="outline"
              className="rounded-xl h-12 px-6 font-semibold border-2 border-primary/30 bg-transparent"
              onClick={goToAuth}
            >
              Войти
            </Button>
          </div>
        </section>

        {/* B) 3 карточки преимуществ */}
        <section className="space-y-4 mb-12">
          {BENEFIT_CARDS.map((card) => (
            <div
              key={card.title}
              className="rounded-2xl bg-primary/5 border border-primary/10 px-4 py-4 shadow-sm"
            >
              <div className="flex gap-3 items-start">
                <span className="text-2xl shrink-0" aria-hidden>
                  {card.emoji}
                </span>
                <div>
                  <p className="font-semibold text-foreground">{card.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {card.text}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* C) Пример результата */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Пример результата
          </h2>
          <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground mb-3">
              Сегодняшнее меню
            </p>
            <ul className="space-y-2">
              {DEMO_MEALS.map((m) => (
                <li
                  key={m.slot}
                  className="flex gap-2 text-sm text-foreground"
                >
                  <span className="text-muted-foreground shrink-0">
                    {m.slot}:
                  </span>
                  <span>{m.title}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground mt-4">
              Такое меню за минуту — с учётом возраста, аллергий и того, что ребёнок любит или не ест
            </p>
          </div>
        </section>

        {/* D) Нижний CTA */}
        <section>
          <Button
            className="w-full rounded-xl h-14 text-base font-semibold"
            onClick={goToFreeCta}
          >
            Получить свой план питания
          </Button>
        </section>
      </main>

      <DemoRecipeSheet open={demoOpen} onOpenChange={setDemoOpen} />
    </div>
  );
}
