import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isStandalone } from "@/utils/standalone";
import { Loader2 } from "lucide-react";

/**
 * Root "/" — умная маршрутизация:
 * - авторизован → app (meal-plan)
 * - не авторизован + standalone PWA → /prelogin
 * - не авторизован + браузер → /welcome
 * Определение standalone только на клиенте после гидрации.
 */
export function RootRedirect() {
  const { user, loading } = useAuth();
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

  if (isStandalone()) {
    return <Navigate to="/prelogin" replace />;
  }

  return <Navigate to="/welcome" replace />;
}
