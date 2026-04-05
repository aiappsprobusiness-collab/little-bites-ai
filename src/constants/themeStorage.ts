/** Ключ localStorage для next-themes (совпадает с inline-скриптом в index.html). */
export const LB_THEME_STORAGE_KEY = "lb-theme";

export type ThemePreference = "light" | "dark";

export function isThemePreference(v: string | null | undefined): v is ThemePreference {
  return v === "light" || v === "dark";
}
