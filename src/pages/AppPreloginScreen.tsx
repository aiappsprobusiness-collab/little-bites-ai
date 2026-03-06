import { useEffect } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { saveOnboardingAttribution } from "@/utils/onboardingAttribution";
import { trackLandingEvent } from "@/utils/landingAnalytics";

/**
 * Pre-login экран для standalone PWA.
 * Не маркетинговый лендинг — короткий, приложенческий стиль.
 */
export default function AppPreloginScreen() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user) return;
    saveOnboardingAttribution(location.pathname, location.search);
    trackLandingEvent("prelogin_view");
  }, [user, location.pathname, location.search]);

  const goToLogin = () => {
    navigate("/auth", { replace: true });
  };

  const goToSignup = () => {
    navigate("/auth", { replace: true, state: { tab: "signup" } });
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
    <div className="min-h-screen min-h-dvh flex flex-col bg-background gradient-hero">
      <main className="flex-1 flex flex-col items-center justify-center px-6 max-w-sm mx-auto">
        <h1 className="text-2xl font-semibold text-foreground text-center mb-2">
          Добро пожаловать
        </h1>
        <p className="text-muted-foreground text-center mb-8">
          Меню на каждый день, рецепты и помощь — в одном приложении
        </p>
        <ul className="text-sm text-muted-foreground space-y-2 mb-10 w-full">
          <li className="flex items-center gap-2">
            <span aria-hidden>✓</span>
            Меню под вашу семью за минуту
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden>✓</span>
            Рецепты с учётом возраста и аллергий
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden>✓</span>
            Вопросы по питанию — ответ в чате
          </li>
        </ul>
        <div className="w-full space-y-3">
          <Button
            className="w-full rounded-xl h-12 font-semibold"
            onClick={goToLogin}
          >
            Войти
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-xl h-12 font-semibold border-2"
            onClick={goToSignup}
          >
            Создать аккаунт
          </Button>
        </div>
      </main>
    </div>
  );
}
