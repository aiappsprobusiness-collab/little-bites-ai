/**
 * Публичный тизер рецепта по id каталога: /t/:id (без логина).
 * Короткий путь вне /recipe/* — иначе часть хостингов/редиректов отдаёт SPA как «/» и пользователь попадает на /auth.
 * Легаси `/recipe/teaser/:id` редиректится на `/t/:id` в App.tsx.
 */

import { useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { WelcomeRecipeBlock } from "@/components/landing/WelcomeRecipeBlock";
import { getPublicCatalogRecipeById } from "@/services/publicRecipeShare";
import { trackUsageEvent } from "@/utils/usageEvents";
import { trackLandingEvent } from "@/utils/landingAnalytics";
import { saveOnboardingAttribution } from "@/utils/onboardingAttribution";

const CTA_LABEL = "Открыть в приложении";

function isUuidLike(s: string): boolean {
  const t = s.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t);
}

/** Редирект со старого URL после деплоя тизера под /recipe/teaser/. */
export function LegacyRecipeTeaserRedirect() {
  const { id } = useParams<{ id: string }>();
  const raw = id?.trim() ?? "";
  if (!raw) return <Navigate to="/welcome" replace />;
  return <Navigate to={`/t/${raw}`} replace />;
}

function buildTeaserAuthSearch(currentSearch: string): string {
  const params = new URLSearchParams(currentSearch);
  params.set("mode", "signup");
  params.set("entry_point", "telegram");
  params.set("utm_source", "telegram");
  return params.toString();
}

export default function PublicRecipeTeaserPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const recipeId = useMemo(() => (idParam ? decodeURIComponent(idParam.trim()) : ""), [idParam]);
  const idOk = isUuidLike(recipeId);

  useEffect(() => {
    if (!recipeId) return;
    saveOnboardingAttribution(location.pathname, location.search);
  }, [recipeId, location.pathname, location.search]);

  const {
    data: recipe,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["publicCatalogRecipeTeaser", recipeId],
    queryFn: () => getPublicCatalogRecipeById(recipeId),
    enabled: idOk,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (user && recipe?.id) {
      navigate(`/recipe/${recipe.id}`, { replace: true });
    }
  }, [user, recipe?.id, navigate]);

  useEffect(() => {
    if (!idOk || !recipe?.id) return;
    trackUsageEvent("recipe_view", {
      properties: {
        recipe_id: recipe.id,
        source: "public_teaser",
        is_public: true,
      },
    });
  }, [idOk, recipe?.id]);

  const handleCta = () => {
    trackLandingEvent("recipe_teaser_cta_click", {
      recipe_id: recipeId,
      entry_point: "telegram",
    });
    const search = buildTeaserAuthSearch(location.search);
    navigate(`/auth?${search}`, { replace: true });
  };

  if (!idOk) {
    return (
      <div className="flex min-h-dvh min-h-screen flex-col items-center justify-center bg-background px-4">
        <p className="mb-4 text-muted-foreground">Ссылка на рецепт недействительна</p>
        <Button variant="outline" onClick={() => navigate("/welcome", { replace: true })}>
          На главную
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-dvh min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Открываем рецепт…</p>
        </div>
      </div>
    );
  }

  if (isError || !recipe) {
    return (
      <div className="flex min-h-dvh min-h-screen flex-col items-center justify-center bg-background px-4">
        <p className="mb-4 text-muted-foreground">Рецепт не найден</p>
        <Button variant="outline" onClick={() => navigate("/welcome", { replace: true })}>
          На главную
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh min-h-screen bg-background" style={{ background: "var(--gradient-hero)" }}>
      <main className="mx-auto w-full max-w-md px-4 py-6 pb-14">
        <section aria-labelledby="teaser-recipe-title">
          <h1 id="teaser-recipe-title" className="sr-only">
            Рецепт
          </h1>
          <WelcomeRecipeBlock recipe={recipe} isLoading={false} preparationStepsVariant="teaser" />
        </section>

        <section className="mt-6">
          <Button className="h-14 w-full rounded-xl text-base font-semibold" onClick={handleCta}>
            {CTA_LABEL}
          </Button>
        </section>
      </main>
    </div>
  );
}
