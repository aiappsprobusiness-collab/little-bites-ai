import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";

/** Для авторизованных пользователей применяет `profiles_v2.theme` (с optimistic update при смене в профиле). */
export function ThemeProfileSync() {
  const { user, authReady } = useAuth();
  const { themePreference } = useSubscription();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!authReady || !user?.id || themePreference === null) return;
    setTheme(themePreference);
  }, [authReady, user?.id, themePreference, setTheme]);

  return null;
}
