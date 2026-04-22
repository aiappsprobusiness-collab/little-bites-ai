import { useState, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/contexts/FamilyContext";
import { PROFILE_FIRST_CHILD_ONBOARDING } from "@/utils/firstChildOnboarding";
import { shouldShowWelcomePage } from "@/utils/navigation";
import { shouldHandOffEmailAuthToCallback } from "@/utils/authEmailLinkParams";
import { Loader2, WifiOff } from "lucide-react";

/** Тот же фон, что splash (`--splash-bg`), чтобы между fade splash и первым экраном не было скачка. */
const BOOT_SCREEN_CLASS =
  "min-h-screen min-h-dvh flex items-center justify-center bg-splash";

/**
 * Root "/" — умная маршрутизация:
 * - в URL есть токены из письма (magic link / confirm / recovery) → /auth/callback (раньше проверки user — иначе recovery уходит в приложение)
 * - сессия recovery (JWT amr: recovery) → /auth/reset-password
 * - авторизован, members загружены и пусто → профиль + создание первого ребёнка (как после письма)
 * - авторизован, есть члены семьи → /meal-plan
 * - не авторизован, первый визит (нет hasSeenWelcome в localStorage) → /welcome
 * - не авторизован, уже видел welcome → /auth
 */
const SLOW_LOAD_SEC = 10;

export function RootRedirect() {
  const { user, loading, isRecoverySession } = useAuth();
  const { members, isLoading: isMembersLoading } = useFamily();
  const location = useLocation();
  const [slowHint, setSlowHint] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setSlowHint(true), SLOW_LOAD_SEC * 1000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (!loading) setSlowHint(false);
  }, [loading]);

  if (loading) {
    return (
      <div className={BOOT_SCREEN_CLASS}>
        <div className="text-center px-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Загрузка...</p>
          {slowHint && (
            <p className="mt-3 text-sm text-muted-foreground flex items-center justify-center gap-2">
              <WifiOff className="w-4 h-4 shrink-0" />
              Долго грузится? Проверьте интернет и обновите страницу.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Токены из письма обрабатываем раньше проверки user: иначе recovery-сессия уводит сразу в приложение.
  if (shouldHandOffEmailAuthToCallback(location.pathname, location.search, location.hash || "")) {
    return (
      <Navigate
        to={{ pathname: "/auth/callback", search: location.search, hash: location.hash }}
        replace
      />
    );
  }

  if (user && isRecoverySession) {
    return <Navigate to="/auth/reset-password" replace />;
  }

  if (user) {
    if (isMembersLoading) {
      return (
        <div className={BOOT_SCREEN_CLASS}>
          <div className="text-center px-4">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Загрузка...</p>
          </div>
        </div>
      );
    }
    if (members.length === 0) {
      return <Navigate to={PROFILE_FIRST_CHILD_ONBOARDING} replace />;
    }
    return <Navigate to="/meal-plan" replace />;
  }

  if (shouldShowWelcomePage()) {
    return <Navigate to="/welcome" replace />;
  }

  return <Navigate to="/auth" replace />;
}
