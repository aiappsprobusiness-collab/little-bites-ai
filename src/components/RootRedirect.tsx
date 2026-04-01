import { useState, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, WifiOff } from "lucide-react";

/** Тот же фон, что канонический splash (#E8F1EC), чтобы между fade splash и первым экраном не было скачка на gradient-hero. */
const BOOT_SCREEN_CLASS =
  "min-h-screen min-h-dvh flex items-center justify-center bg-[#E8F1EC]";

function hasAuthParamsInUrl(search: string, hash: string): boolean {
  const inHash = /access_token|refresh_token|type=recovery/.test(hash || "");
  const params = new URLSearchParams(search);
  return inHash || params.has("access_token") || params.has("refresh_token");
}

/**
 * Root "/" — умная маршрутизация:
 * - авторизован → app (meal-plan)
 * - в URL есть токены из письма (magic link / confirm) → /auth/callback (сохраняем hash/query)
 * - не авторизован → /auth (страница входа).
 */
const SLOW_LOAD_SEC = 10;

export function RootRedirect() {
  const { user, loading } = useAuth();
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

  return <Navigate to="/auth" replace />;
}
