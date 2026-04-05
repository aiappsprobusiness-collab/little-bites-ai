import { useTheme as useNextTheme } from "next-themes";
import type { ThemePreference } from "@/constants/themeStorage";

/**
 * Обёртка над next-themes: класс `dark` на `document.documentElement`, хранение в localStorage (`lb-theme`).
 */
export function useTheme() {
  const ctx = useNextTheme();

  const setThemePref = (theme: ThemePreference) => {
    ctx.setTheme(theme);
  };

  /** Повторно применяет текущее значение из контекста. */
  const applyTheme = () => {
    const t = (ctx.theme ?? "light") as ThemePreference;
    ctx.setTheme(t);
  };

  return {
    ...ctx,
    theme: ctx.theme as ThemePreference | undefined,
    setTheme: setThemePref,
    resolvedTheme: ctx.resolvedTheme as "light" | "dark" | undefined,
    systemTheme: ctx.systemTheme as "light" | "dark" | undefined,
    applyTheme,
  };
}
