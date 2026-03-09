import { useState, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isStandalone } from "@/utils/standalone";
import { Loader2 } from "lucide-react";

function hasAuthParamsInUrl(search: string, hash: string): boolean {
  const inHash = /access_token|refresh_token|type=recovery/.test(hash || "");
  const params = new URLSearchParams(search);
  return inHash || params.has("access_token") || params.has("refresh_token");
}

/**
 * Root "/" — умная маршрутизация:
 * - авторизован → app (meal-plan)
 * - в URL есть токены из письма (magic link / confirm) → /auth/callback (сохраняем hash/query)
 * - не авторизован + standalone PWA → /prelogin
 * - не авторизован + браузер → /welcome
 * Определение standalone только на клиенте после гидрации.
 */
export function RootRedirect() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (loading || !mounted) {
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
    return <Navigate to="/meal-plan" replace />;
  }

  // Ссылка из письма могла привести на корень с #access_token=... — отдаём callback-странице
  if (hasAuthParamsInUrl(location.search, location.hash || "")) {
    return (
      <Navigate
        to={{ pathname: "/auth/callback", search: location.search, hash: location.hash }}
        replace
      />
    );
  }

  if (isStandalone()) {
    return <Navigate to="/prelogin" replace />;
  }

  return <Navigate to="/welcome" replace />;
}
