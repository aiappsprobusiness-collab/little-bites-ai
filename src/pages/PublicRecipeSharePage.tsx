/**
 * Публичная страница шаринга одного рецепта: /r/:shareRef.
 * Показывает конкретный расшаренный рецепт без авторизации, затем CTA → signup.
 * Без welcome-прокладки.
 */

import { useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { WelcomeRecipeBlock } from "@/components/landing/WelcomeRecipeBlock";
import { getRecipeByShareRef } from "@/services/publicRecipeShare";
import { setShareAttributionFromShortLink, trackUsageEvent } from "@/utils/usageEvents";
import { trackLandingEvent } from "@/utils/landingAnalytics";
import { saveOnboardingAttribution } from "@/utils/onboardingAttribution";

const CTA_TEXT = "Собрать меню для своей семьи";

function buildAuthSearchParams(shareRef: string, currentSearch: string): string {
  const params = new URLSearchParams(currentSearch);
  params.set("mode", "signup");
  params.set("entry_point", "shared_recipe");
  params.set("share_ref", shareRef);
  params.set("share_type", "recipe");
  return params.toString();
}

export default function PublicRecipeSharePage() {
  const { shareRef } = useParams<{ shareRef: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const decodedRef = useMemo(
    () => (shareRef ? decodeURIComponent(shareRef.trim()) : ""),
    [shareRef]
  );

  useEffect(() => {
    if (!decodedRef) return;
    setShareAttributionFromShortLink(decodedRef);
    saveOnboardingAttribution(location.pathname, location.search);
  }, [decodedRef, location.pathname, location.search]);

  const {
    data: recipe,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["publicRecipeByShareRef", decodedRef],
    queryFn: () => getRecipeByShareRef(decodedRef),
    enabled: !!decodedRef,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (user && recipe?.id) {
      navigate(`/recipe/${recipe.id}`, { replace: true });
    }
  }, [user, recipe?.id, navigate]);

  useEffect(() => {
    if (!decodedRef || !recipe) return;
    trackUsageEvent("share_landing_view", {
      properties: {
        share_ref: decodedRef,
        source: "short_link",
        recipe_id: recipe.id,
        share_type: "recipe",
      },
    });
  }, [decodedRef, recipe]);

  const handleCta = () => {
    trackLandingEvent("share_recipe_cta_click", {
      share_ref: decodedRef,
      share_type: "recipe",
      entry_point: "shared_recipe",
    });
    const search = buildAuthSearchParams(decodedRef, location.search);
    navigate(`/auth?${search}`, { replace: true });
  };

  if (!decodedRef) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <p className="text-muted-foreground mb-4">Ссылка недействительна</p>
        <Button variant="outline" onClick={() => navigate("/welcome", { replace: true })}>
          На главную
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Открываем рецепт…</p>
        </div>
      </div>
    );
  }

  if (isError || !recipe) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <p className="text-muted-foreground mb-4">Рецепт не найден или ссылка устарела</p>
        <Button variant="outline" onClick={() => navigate("/welcome", { replace: true })}>
          На главную
        </Button>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen min-h-dvh bg-background"
      style={{ background: "var(--gradient-hero)" }}
    >
      <main className="max-w-md mx-auto w-full px-4 py-6 pb-14">
        <section aria-labelledby="shared-recipe-title">
          <h1 id="shared-recipe-title" className="sr-only">
            Расшаренный рецепт
          </h1>
          <WelcomeRecipeBlock recipe={recipe} isLoading={false} />
        </section>

        <section className="mt-6 space-y-4">
          <div className="rounded-2xl bg-primary/5 border border-primary/10 p-4">
            <p className="text-sm text-muted-foreground mb-2">
              В Mom Recipes можно собрать меню для всей семьи с учётом возраста, аллергий и
              предпочтений.
            </p>
          </div>
          <Button
            className="w-full rounded-xl h-14 text-base font-semibold"
            onClick={handleCta}
          >
            {CTA_TEXT}
          </Button>
        </section>
      </main>
    </div>
  );
}
