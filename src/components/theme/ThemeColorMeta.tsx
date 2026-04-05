import { useEffect } from "react";
import { useTheme } from "next-themes";

/** Обновляет meta theme-color под светлую/тёмную схему (PWA / браузер). */
export function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const light = cs.getPropertyValue("--theme-color-light").trim() || "#e8f1ec";
    const dark = cs.getPropertyValue("--theme-color-dark").trim() || "#1c1c22";
    const content = resolvedTheme === "dark" ? dark : light;
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((el) => {
      el.setAttribute("content", content);
    });
  }, [resolvedTheme]);

  return null;
}
